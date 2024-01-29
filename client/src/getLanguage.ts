/*
 * This file is part of modelica-language-server.
 *
 * modelica-language-server is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * modelica-language-server is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with modelica-language-server. If not, see
 * <http://www.gnu.org/licenses/>.
 */


import * as path from 'path';
import { TextDocument } from 'vscode';

type LanguageTypes = 'modelica' | 'metamodelica' | 'unknown'

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
