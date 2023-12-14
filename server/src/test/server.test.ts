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
const parsedModelicaTestString = "(stored_definitions storedDefinitions: (stored_definition classDefinition: (class_definition classPrefixes: (class_prefixes) classSpecifier: (long_class_specifier identifier: (IDENT) descriptionString: (description_string value: (STRING)) (element_list element: (named_element componentClause: (component_clause typeSpecifier: (type_specifier name: (name identifier: (IDENT))) componentDeclarations: (component_list componentDeclaration: (component_declaration declaration: (declaration identifier: (IDENT) modification: (modification classModification: (class_modification arguments: (argument_list argument: (element_modification name: (name identifier: (IDENT)) modification: (modification expression: (expression (simple_expression (primary_expression (literal_expression (unsigned_integer_literal_expression (UNSIGNED_INTEGER)))))))) argument: (element_modification name: (name identifier: (IDENT)) modification: (modification expression: (expression (simple_expression (primary_expression (literal_expression (logical_literal_expression))))))))))) descriptionString: (description_string value: (STRING)))))) element: (named_element componentClause: (component_clause typeSpecifier: (type_specifier name: (name identifier: (IDENT))) componentDeclarations: (component_list componentDeclaration: (component_declaration declaration: (declaration identifier: (IDENT) modification: (modification classModification: (class_modification arguments: (argument_list argument: (element_modification name: (name identifier: (IDENT))))) expression: (expression (simple_expression (binary_expression operand1: (simple_expression (unary_expression operand: (simple_expression (primary_expression (literal_expression (unsigned_real_literal_expression (UNSIGNED_REAL))))))) operand2: (simple_expression (primary_expression (component_reference identifier: (IDENT)))))))))))))) endIdentifier: (IDENT)))))";

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
