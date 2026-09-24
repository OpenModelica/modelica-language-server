# OMEdit client compatibility smoke test

This test checks the **server revision under test against OMEdit's production
Qt LSP client**. It belongs in the language-server CI so changes to the server
cannot silently break this client. It complements OMEdit's own tests.

It compiles the unmodified `ModelicaLSPClient`, `LSPClient` and `LSPFileWatcher`
sources from OpenModelica revision
`8e77d72e0f5ed79a9c6fc404191f7988f168432d` (also pinned in the workflow), and
uses Qt Test/QSignalSpy with a real, freshly built standalone server. It checks:

- Initialization completes, and the server stays running without restarting.
- A cross-file definition response identifies the expected declaration and range.
- Hover returns content for that declaration.
- An unsaved change switches the definition to another file while disk text stays unchanged.
- Documents and the server can be closed without a client error.

There is no fake LSP server or reimplementation of the OMEdit transport. The
harness supplies only the two application services referenced by those sources:
`Helper::OpenModelicaHome` and an isolated `Utilities::tempDirectory()` for crash
logs. The client gets an explicit server executable and a temporary library.
No user settings, libraries or existing OMEdit session are used.

This is a client/server compatibility test, not a full OMEdit GUI test. It does
not test menu wiring, navigation of editor widgets, fallback navigation, or
features that OMEdit does not expose through this client, such as semantic-token
rendering. A successful result must come from the LSP definition response.
It needs neither MCP nor OMC nor a display/Xvfb. Qt Widgets headers are needed
by OMEdit's utility declarations, but the test runs a QCoreApplication.

## Run locally

Install a C++17 compiler, CMake and Qt 6 development files including Qt Test
(`cmake g++ qt6-base-dev` on Ubuntu). Check out the pinned OpenModelica revision
in a separate directory; no submodules are needed. From the language-server root:

```sh
npm --prefix server ci
npm --prefix server run build:standalone
cmake -S tests/qt-smoke -B /tmp/modelica-qt-smoke \
  -DOPENMODELICA_SOURCE=/absolute/path/to/OpenModelica \
  -DMODELICA_LSP_EXECUTABLE="$PWD/server/out/modelica-language-server"
cmake --build /tmp/modelica-qt-smoke --parallel 2
ctest --test-dir /tmp/modelica-qt-smoke --output-on-failure
```

The server binary and both WASM files must be kept together. CTest fails if a
prerequisite or assertion is missing; it does not skip an unavailable server.
Responses have bounded waits, with a 60-second CTest timeout. Temporary models
are removed and the test-owned server is stopped even after a failed assertion.
The test writes `qt-smoke.xml` and CTest's `Temporary/LastTest.log`; CI uploads
these with version/revision metadata, including on failure.

The `OMEdit Qt client compatibility` job runs on pull requests, main pushes and
release tags. Release publication depends on this job. Update the pinned client
revision here and in the workflow together when extending compatibility coverage.
