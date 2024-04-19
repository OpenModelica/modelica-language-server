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

import { Position, Range, TextDocument } from "vscode-languageserver-textdocument";
import * as LSP from "vscode-languageserver/node";
import Parser from "web-tree-sitter";
import * as fs from "node:fs/promises";
import * as url from "node:url";

import * as TreeSitterUtil from "../util/tree-sitter";
import { positionToPoint } from "../util/tree-sitter";
import { ModelicaProject } from "./project";
import { ModelicaScope } from "./scope";
import { publicDecrypt } from 'node:crypto';
import path from 'node:path';

export class ModelicaDocument implements ModelicaScope, TextDocument {
  readonly #project: ModelicaProject;
  readonly #path: string;
  readonly #document: TextDocument;
  #tree: Parser.Tree;

  private constructor(project: ModelicaProject, path: string, document: TextDocument, tree: Parser.Tree) {
    this.#project = project;
    this.#path = path;
    this.#document = document;
    this.#tree = tree;
  }

  public static async load(
    project: ModelicaProject,
    path: string,
  ): Promise<ModelicaDocument> {
    const content = await fs.readFile(path, "utf-8");
    const uri = url.pathToFileURL(path).href;
    return new ModelicaDocument(
      project,
      path,
      TextDocument.create(uri, "modelica", 0, content),
      project.parser.parse(content),
    );
  }

  public async update(text: string, range?: Range): Promise<void> {
    if (range === undefined) {
      TextDocument.update(this.#document, [{ text }], this.version + 1);
      this.#tree = this.#project.parser.parse(text);
      return;
    }

    const startIndex = this.offsetAt(range.start);
    const startPosition = positionToPoint(range.start);
    const oldEndIndex = this.offsetAt(range.end);
    const oldEndPosition = positionToPoint(range.end);
    const newEndIndex = startIndex + text.length;

    TextDocument.update(this.#document, [{ text, range }], this.version + 1);
    const newEndPosition = positionToPoint(this.positionAt(newEndIndex));

    this.#tree.edit({
      startIndex,
      startPosition,
      oldEndIndex,
      oldEndPosition,
      newEndIndex,
      newEndPosition,
    });

    this.#tree = this.#project.parser.parse((index: number, position?: Parser.Point) => {
      if (position !== undefined) {
        return this.getText({
          start: {
            character: position.column,
            line: position.row,
          },
          end: {
            character: position.column + 1,
            line: position.row,
          },
        });
      } else {
        return this.getText({
          start: this.positionAt(index),
          end: this.positionAt(index + 1),
        });
      }
    }, this.#tree);
  }

  public async resolve(reference: string[]): Promise<LSP.SymbolInformation | null> {
    let foundSymbol: Parser.SyntaxNode | null = null;
    TreeSitterUtil.forEach(this.#tree.rootNode, (node: Parser.SyntaxNode) => {
      if (foundSymbol) {
        return false;
      }

      // TODO: Is this right?
      const className = node
        .childForFieldName("classSpecifier")
        ?.childForFieldName("IDENT")
        ?.toString();
      if (node.type == "class_definition" && className == reference[0]) {
        reference = reference.slice(1);
        if (reference.length == 0) {
          foundSymbol = node;
        }

        return true;
      }

      return false;
    });

    return foundSymbol;
  }

  public getText(range?: Range | undefined): string {
    return this.#document.getText(range);
  }

  public positionAt(offset: number): Position {
    return this.#document.positionAt(offset);
  }

  public offsetAt(position: Position): number {
    return this.#document.offsetAt(position);
  }

  public get uri(): string {
    return this.#document.uri;
  }

  public get path(): string {
    return this.#path;
  }

  public get languageId(): string {
    return this.#document.languageId;
  }

  public get version(): number {
    return this.#document.version;
  }

  public get lineCount(): number {
    return this.#document.lineCount;
  }

  public get project(): ModelicaProject {
    return this.#project;
  }

  // public get tree(): Parser.Tree {
  //   return this.#tree;
  // }
}
