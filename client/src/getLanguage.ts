/*
 * This file is part of OpenModelica.
 *
 * Copyright (c) 1998-2024, Open Source Modelica Consortium (OSMC),
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

import * as path from 'path';
import { TextDocument } from 'vscode';

type LanguageTypes = 'modelica' | 'metamodelica' | 'unknown';

export function getFileExtension(document: TextDocument): string | undefined {
  const uri = document.uri;
  const filePath = uri.fsPath;
  return path.extname(filePath);
}

function hasMetaModelicaKeywords(content: string): boolean {
  const unionRegex = new RegExp('\\b(uniontype)\\s+(\\w+)\\s*(".*")*');

  return unionRegex.test(content);
}

/**
 * Check if the text document is a Modelica files, MetaModelica file or other.
 * @param document Text document.
 */
export function getLanguage(document: TextDocument): LanguageTypes {
  // Check
  if (hasMetaModelicaKeywords(document.getText())) {
    return 'metamodelica';
  }

  return 'modelica';
}
