import { SyntaxNode } from 'web-tree-sitter';
import * as TreeSitterUtil from './tree-sitter';
import * as LSP from 'vscode-languageserver';
import { logger } from './logger';

/**
 * Extracts hover information for a Modelica class or package.
 *
 * @param rootNode The root node of the AST for the current document.
 * @param position The position of the cursor in the document.
 * @returns Text of the description_string or string saying there is no description.
 */
export function extractHoverInformation(targetNode: SyntaxNode): string {

    // Find the parent class_definition node.
    const classDefNode = TreeSitterUtil.findParent(targetNode, n => n.type === 'class_definition');

    if (!classDefNode) {
        logger.debug('No class definition found.');
        return '';
    }

    // Check if the targetNode is the first IDENT child of the class_definition, indicating it's the class name.
    const isClassName = classDefNode.namedChildren.some((child, index) =>
    child.type === 'long_class_specifier' &&
    child.firstChild?.type === 'IDENT' &&
    child.firstChild?.text === targetNode.text);

    if (!isClassName) {
      logger.debug('Target node is not the class name identifier.');
      return '';
    }

    const classDescription = extractClassDescription(classDefNode);
    const inputInformation = extractInputInformation(classDefNode);
    const outputInformation = extractOutputInformation(classDefNode);
    const parameterInformation = extractParameterInformation(classDefNode);

    return `${classDescription} ${parameterInformation} ${inputInformation} ${outputInformation}`;
}

function extractClassDescription(classDefNode: SyntaxNode): string {
  const descriptionNode = TreeSitterUtil.findFirst(classDefNode, n => n.type === 'description_string');
  const descriptionText = descriptionNode ? descriptionNode.firstChild?.text : null;

  return descriptionText ? `\n${descriptionText}` : '';
}

function extractInputInformation(classDefNode: SyntaxNode): string {
  const inputsInfo: string[] = [];

  TreeSitterUtil.forEach(classDefNode, (node) => {

      if (node.type === 'component_clause' && node.text.includes('input')) {

          const typeSpecifierNode = node.childForFieldName('typeSpecifier');
          logger.debug(`Type specifier node: ${typeSpecifierNode}`);
          const typeSpecifier = typeSpecifierNode ? typeSpecifierNode.text : "Unknown Type";

          const componentDeclarationNode = node.childForFieldName('componentDeclarations');

          const declarationNode = componentDeclarationNode?.firstChild?.childForFieldName('declaration');
          logger.debug(`Declaration node: ${declarationNode}`);
          const identifier = declarationNode ? declarationNode.text : "Unknown Identifier";

          // Extracting description from description_string node
          const descriptionNode = componentDeclarationNode?.firstChild?.childForFieldName('descriptionString');
          const description = descriptionNode ? descriptionNode.text : '';

          inputsInfo.push(`${typeSpecifier} ${identifier} ${description}\n`);
      }
      return true;
  });

  if (inputsInfo.length > 0) {
    return "\n## Inputs:\n" + inputsInfo.join('\n');
  }

  return '';
}

function extractOutputInformation(classDefNode: SyntaxNode): string {
  const outputsInfo: string[] = [];

  TreeSitterUtil.forEach(classDefNode, (node) => {

      if (node.type === 'component_clause' && node.text.includes('output')) {

          const typeSpecifierNode = node.childForFieldName('typeSpecifier');
          logger.debug(`Type specifier node: ${typeSpecifierNode}`);
          const typeSpecifier = typeSpecifierNode ? typeSpecifierNode.text : "Unknown Type";

          const componentDeclarationNode = node.childForFieldName('componentDeclarations');

          const declarationNode = componentDeclarationNode?.firstChild?.childForFieldName('declaration');
          logger.debug(`Declaration node: ${declarationNode}`);
          const identifier = declarationNode ? declarationNode.text : "Unknown Identifier";

          // Extracting description from description_string node
          const descriptionNode = componentDeclarationNode?.firstChild?.childForFieldName('descriptionString');
          const description = descriptionNode ? descriptionNode.text : '';

          outputsInfo.push(`${typeSpecifier} ${identifier} ${description}\n`);
      }
      return true;
  });

  if (outputsInfo.length > 0) {
      return "\n## Outputs:\n" + outputsInfo.join('\n');
  }
  return '';
}

function extractParameterInformation(classDefNode: SyntaxNode): string {
  const parametersInfo: string[] = [];

  TreeSitterUtil.forEach(classDefNode, (node) => {

      if (node.type === 'component_clause' && node.text.includes('parameter')) {

              const typeSpecifierNode = node.childForFieldName('typeSpecifier');
              logger.debug(`Type specifier node: ${typeSpecifierNode}`);
              const typeSpecifier = typeSpecifierNode ? typeSpecifierNode.text : "Unknown Type";

              const componentDeclarationNode = node.childForFieldName('componentDeclarations');

              const declarationNode = componentDeclarationNode?.firstChild?.childForFieldName('declaration');
              logger.debug(`Declaration node: ${declarationNode}`);
              const identifier = declarationNode ? declarationNode.text : "Unknown Identifier";

              // Extracting description from description_string node
              const descriptionNode = componentDeclarationNode?.firstChild?.childForFieldName('descriptionString');
              const description = descriptionNode ? descriptionNode.text : '';

              parametersInfo.push(`${typeSpecifier} ${identifier} ${description}\n`);
          }
      return true;
  });

  if (parametersInfo.length > 0) {
      return "\n## Parameters:\n" + parametersInfo.join('\n');
  }
  return '';
}
