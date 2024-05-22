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

import * as Mocha from 'mocha';
import * as assert from 'assert';
import * as Parser from 'web-tree-sitter';

import { initializeParser } from '../parser';

const modelicaTestString = `
model M "Hello World Modelica"
  Real x(start=1,fixed=true) "state";
equations
  der(x) = -0.5*x;
end M;
`;
const parsedModelicaTestString =
  '(stored_definitions storedDefinitions: (stored_definition classDefinition: (class_definition classPrefixes: (class_prefixes) classSpecifier: (long_class_specifier identifier: (IDENT) descriptionString: (description_string value: (STRING)) (element_list element: (named_element componentClause: (component_clause typeSpecifier: (type_specifier name: (name identifier: (IDENT))) componentDeclarations: (component_list componentDeclaration: (component_declaration declaration: (declaration identifier: (IDENT) modification: (modification classModification: (class_modification arguments: (argument_list argument: (element_modification name: (name identifier: (IDENT)) modification: (modification expression: (expression (simple_expression (primary_expression (literal_expression (unsigned_integer_literal_expression (UNSIGNED_INTEGER)))))))) argument: (element_modification name: (name identifier: (IDENT)) modification: (modification expression: (expression (simple_expression (primary_expression (literal_expression (logical_literal_expression))))))))))) descriptionString: (description_string value: (STRING)))))) element: (named_element componentClause: (component_clause typeSpecifier: (type_specifier name: (name identifier: (IDENT))) componentDeclarations: (component_list componentDeclaration: (component_declaration declaration: (declaration identifier: (IDENT) modification: (modification classModification: (class_modification arguments: (argument_list argument: (element_modification name: (name identifier: (IDENT))))) expression: (expression (simple_expression (binary_expression operand1: (simple_expression (unary_expression operand: (simple_expression (primary_expression (literal_expression (unsigned_real_literal_expression (UNSIGNED_REAL))))))) operand2: (simple_expression (primary_expression (component_reference identifier: (IDENT)))))))))))))) endIdentifier: (IDENT)))))';

describe('Modelica tree-sitter parser', () => {
  it('Initialize parser', async () => {
    const parser = await initializeParser();
  });

  it('Parse string', async () => {
    const parser = await initializeParser();
    const tree = parser.parse(modelicaTestString);
    const parsedString = tree.rootNode.toString();
    assert.equal(parsedString, parsedModelicaTestString);
  });
});
