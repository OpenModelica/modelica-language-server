/*
 * This file is part of OpenModelica.
 *
 * Copyright (c) 1998-2026, Open Source Modelica Consortium (OSMC),
 * c/o Linköpings universitet, Department of Computer and Information Science,
 * SE-58183 Linköping, Sweden.
 *
 * All rights reserved.
 *
 * THIS PROGRAM IS PROVIDED UNDER THE TERMS OF AGPL VERSION 3 LICENSE OR
 * THIS OSMC PUBLIC LICENSE (OSMC-PL) VERSION 1.8.
 * ANY USE, REPRODUCTION OR DISTRIBUTION OF THIS PROGRAM CONSTITUTES
 * RECIPIENT'S ACCEPTANCE OF THE OSMC PUBLIC LICENSE OR THE GNU AGPL
 * VERSION 3, ACCORDING TO RECIPIENTS CHOICE.
 *
 * The OpenModelica software and the OSMC (Open Source Modelica Consortium)
 * Public License (OSMC-PL) are obtained from OSMC, either from the above
 * address, from the URLs:
 * http://www.openmodelica.org or
 * https://github.com/OpenModelica/ or
 * http://www.ida.liu.se/projects/OpenModelica,
 * and in the OpenModelica distribution.
 *
 * GNU AGPL version 3 is obtained from:
 * https://www.gnu.org/licenses/licenses.html#GPL
 *
 * This program is distributed WITHOUT ANY WARRANTY; without
 * even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE, EXCEPT AS EXPRESSLY SET FORTH
 * IN THE BY RECIPIENT SELECTED SUBSIDIARY LICENSE CONDITIONS OF OSMC-PL.
 *
 * See the full OSMC Public License conditions for more details.
 *
 */


#include "LSP/ModelicaLSPClient.h"
#include "Util/Helper.h"
#include "Util/Utilities.h"

#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QUrl>
#include <QtTest>

// The unmodified OMEdit client references these two application services.
// Supply only isolated paths here; all transport, initialization, document
// synchronization, request handling and file watching use production code.
QString Helper::OpenModelicaHome;
namespace Utilities {
QString &tempDirectory()
{
  static QTemporaryDir directory;
  static QString path = directory.path() + QDir::separator();
  return path;
}
}

class SmokeTest : public QObject
{
  Q_OBJECT
private:
  QTemporaryDir workspace;
  ModelicaLSPClient client;

  void writeFile(const QString &name, const QByteArray &contents)
  {
    QFile file(workspace.filePath("Smoke/" + name));
    QVERIFY2(file.open(QIODevice::WriteOnly), qPrintable(file.errorString()));
    QCOMPARE(file.write(contents), qint64(contents.size()));
  }

  QString uri(const QString &name) const
  {
    return QUrl::fromLocalFile(workspace.filePath("Smoke/" + name)).toString();
  }

private slots:
  void realServerSession()
  {
    QVERIFY(workspace.isValid());
    QVERIFY(QDir(workspace.path()).mkdir("Smoke"));
    const QString server = qEnvironmentVariable("MODELICA_LSP_EXECUTABLE");
    QVERIFY2(QFileInfo(server).isExecutable(), qPrintable("Not executable: " + server));
    QVERIFY2(ModelicaLSPClient::missingRuntimeFiles(server).isEmpty(), "Missing server WASM files");
    qInfo().noquote() << "Server under test:" << QFileInfo(server).canonicalFilePath();
    qInfo() << "Qt version:" << qVersion();

    writeFile("package.mo", "package Smoke end Smoke;\n");
    writeFile("Target.mo", "within Smoke;\nmodel Target\n  Real x;\nend Target;\n");
    writeFile("Other.mo", "within Smoke;\nmodel Other\n  Real y;\nend Other;\n");
    const QString source = "within Smoke;\nmodel Use\n  Target component;\nend Use;\n";
    writeFile("Use.mo", source.toUtf8());

    QSignalSpy initialized(&client, &LSPClient::initialized);
    QSignalSpy errors(&client, &LSPClient::serverError);
    QSignalSpy definitions(&client, &LSPClient::definitionResult);
    QSignalSpy hovers(&client, &LSPClient::hoverResult);
    connect(&client, &LSPClient::logMessage, this, [](const QString &message, int type) {
      if (type < 5) qInfo().noquote() << "LSP log" << type << message;
    });
    connect(&client, &LSPClient::serverError, this, [](const QString &message) {
      qWarning().noquote() << "LSP error:" << message;
    });

    QVERIFY(client.start(server, QUrl::fromLocalFile(workspace.path()).toString(), {workspace.filePath("Smoke")}));
    QTRY_COMPARE_WITH_TIMEOUT(initialized.count(), 1, 10000);
    QVERIFY(client.isRunning());
    client.openDocument(uri("Use.mo"), "modelica", source);

    // didOpen/didChange analysis is asynchronous. Retry completed empty/stale
    // responses within a deadline, but never accept fallback GUI navigation.
    auto definition = [&](const QString &target, int sourceColumn = 4, int targetLine = 1,
                          int targetColumn = 0, int targetEndLine = 3) -> bool {
      QElapsedTimer timer;
      timer.start();
      while (timer.elapsed() < 10000) {
        definitions.clear();
        const int request = client.requestDefinition(uri("Use.mo"), 2, sourceColumn);
        if (request < 0 || (definitions.isEmpty() && !definitions.wait(1000))) return false;
        const auto result = definitions.takeFirst();
        if (result.at(0).toInt() != request) return false;
        const auto location = qvariant_cast<LSP::Location>(result.at(1));
        if (location.uri == uri(target)) {
          // The returned range must cover the target declaration, not Use.mo.
          qInfo() << "Definition:" << location.uri << location.range.start.line << location.range.start.character;
          return location.range.start.line == targetLine && location.range.start.character == targetColumn
            && location.range.end.line == targetEndLine;
        }
        QTest::qWait(25);
      }
      return false;
    };
    QVERIFY2(definition("Target.mo"), "No LSP definition at Target's declaration");
    const int hoverRequest = client.requestHover(uri("Use.mo"), 2, 4);
    QVERIFY(hoverRequest >= 0);
    QTRY_COMPARE_WITH_TIMEOUT(hovers.count(), 1, 10000);
    QCOMPARE(hovers.first().at(0).toInt(), hoverRequest);
    QVERIFY2(hovers.first().at(1).toString().contains("Target"), qPrintable(hovers.first().at(1).toString()));

    // Change only the editor buffer. The disk file must still refer to Target.
    client.changeDocument(uri("Use.mo"), QString(source).replace("Target", "Other"));
    QVERIFY2(definition("Other.mo"), "Definition did not follow the unsaved edit");
    QFile disk(workspace.filePath("Smoke/Use.mo"));
    QVERIFY(disk.open(QIODevice::ReadOnly));
    QCOMPARE(disk.readAll(), source.toUtf8());
    // Modifier labels must resolve in the component type, including inherited
    // parameters, and follow changes to the unsaved component declaration (#104).
    writeFile("Base.mo", "within Smoke;\nmodel Base\n  parameter Real Ti=1;\nend Base;\n");
    writeFile("Controller.mo", "within Smoke;\nmodel Controller\n  extends Base;\nend Controller;\n");
    writeFile("Alternate.mo", "within Smoke;\nmodel Alternate\n  parameter Real Ti=2;\nend Alternate;\n");
    const QString modified = "within Smoke;\nmodel Use\n  Controller PI(Ti=0.1);\nend Use;\n";
    client.changeDocument(uri("Use.mo"), modified);
    QVERIFY2(definition("Base.mo", modified.section('\n', 2, 2).indexOf("Ti") + 1, 2, 2, 2),
             "Modifier did not resolve to the inherited parameter");
    const QString alternate = QString(modified).replace("Controller", "Alternate");
    client.changeDocument(uri("Use.mo"), alternate);
    QVERIFY2(definition("Alternate.mo", alternate.section('\n', 2, 2).indexOf("Ti") + 1, 2, 2, 2),
             "Modifier did not follow the unsaved component type change");
    // The effective type of a replaceable class belongs to this instance.
    writeFile("Wrapper.mo", "within Smoke;\nmodel Wrapper\n  replaceable model C=Base;\n  C item;\nend Wrapper;\n");
    const QString redeclared = "within Smoke;\nmodel Use\n  Wrapper w(redeclare model C=Alternate, item(Ti=0.1));\nend Use;\n";
    client.changeDocument(uri("Use.mo"), redeclared);
    QVERIFY2(definition("Alternate.mo", redeclared.section('\n', 2, 2).indexOf("Ti") + 1, 2, 2, 2),
             "Modifier ignored the instance class redeclaration");
    const QString defaultType = QString(redeclared).replace("redeclare model C=Alternate, ", "");
    client.changeDocument(uri("Use.mo"), defaultType);
    QVERIFY2(definition("Base.mo", defaultType.section('\n', 2, 2).indexOf("Ti") + 1, 2, 2, 2),
             "Removing the redeclaration did not restore the default type");
    disk.seek(0);
    QCOMPARE(disk.readAll(), source.toUtf8());
    client.closeDocument(uri("Use.mo"));
    client.stop();
    QVERIFY(!client.isRunning());
    QCOMPARE(initialized.count(), 1); // No silent crash/restart during the test.
    QCOMPARE(errors.count(), 0);
  }

  void cleanup()
  {
    client.stop(); // Also runs when a QVERIFY fails.
  }
};

QTEST_GUILESS_MAIN(SmokeTest)
#include "SmokeTest.moc"
