import { SyntaxNode } from 'web-tree-sitter';
import * as TreeSitterUtil from './tree-sitter';
import * as LSP from 'vscode-languageserver';
import { logger } from './logger';

/**
 * Extracts hover information for given node.
 *
 * Documentation and information for class description, inputs, outputs and
 * parameters.
 *
 * @param node Syntax Node.
 *
 * @returns Hover content or null if no information available.
 */
export function extractHoverInformation(node: SyntaxNode): string | null {
    // Find the parent class_definition node.
    const classDefNode = TreeSitterUtil.findParent(node, n => n.type === 'class_definition');
    if (!classDefNode) {
        logger.debug('extractHoverInformation: No class definition found.');
        return null;
    }

    // Check if node is the first IDENT child of the class_definition, indicating it's the class name.
    const isClassName = classDefNode.namedChildren.some((child, _) =>
      child.type === 'long_class_specifier' &&
      child.firstChild?.type === 'IDENT' &&
      child.firstChild?.text === node.text);

    if (!isClassName) {
      logger.debug('extractHoverInformation: Target node is not the class name identifier.');
      return null;
    }

    const classDescription = TreeSitterUtil.getDescriptionString(classDefNode);
    const {inputsInfo, outputsInfo, parameterInfo, parameterInputsInfo, parameterOutputsInfo} = extractComponentInformation(classDefNode);
    const classDefinition = [
      TreeSitterUtil.getClassPrefixes(classDefNode),
      node.text,
      classDescription,
    ].join(' ').trim();

    return [
      '```modelica',
      classDefinition,
      '```',
      '---',
      inputsInfo,
      parameterInputsInfo,
      outputsInfo,
      parameterOutputsInfo,
      parameterInfo
    ].join('\n');
}

function extractComponentInformation(
  classDefNode: SyntaxNode): {
    inputsInfo: string | undefined;
    outputsInfo: string | undefined;
    parameterInfo: string | undefined;
    parameterInputsInfo: string | undefined;
    parameterOutputsInfo: string | undefined;
  } {

  const inputsInfo: string[] = [];
  const outputsInfo: string[] = [];
  const parameterInfo: string[] = [];
  const parameterInputsInfo: string[] = [];
  const parameterOutputsInfo: string[] = [];
  let inputsString: string | undefined = undefined;
  let outputsString: string | undefined = undefined;
  let parameterString: string | undefined = undefined;
  let parameterInputsString: string | undefined = undefined;
  let parameterOutputsString: string | undefined = undefined;

  TreeSitterUtil.forEach(classDefNode, (node) => {
    if (node.type === 'component_clause') {
      const prefix = TreeSitterUtil.getPrefix(node);
      const isParameter = TreeSitterUtil.isParameter(node);
      if (prefix !== undefined || isParameter) {
        const typeSpecifierNode = node.childForFieldName('typeSpecifier');
        const typeSpecifier = typeSpecifierNode ? typeSpecifierNode.text : "Unknown Type";

        const componentDeclarationNode = node.childForFieldName('componentDeclarations');
        const declarationNode = componentDeclarationNode?.firstChild?.childForFieldName('declaration');
        const identifier = declarationNode ? declarationNode.text : "Unknown Identifier";

        // Extracting description from description_string node
        const descriptionNode = componentDeclarationNode?.firstChild?.childForFieldName('descriptionString');
        const description = descriptionNode ? descriptionNode.text : '';

        const info = [
          isParameter ? 'parameter' : undefined,
          prefix,
          typeSpecifier,
          identifier,
          description
        ].filter( (e) => e !== undefined ).join(' ') + ';';

        if (prefix === 'input') {
          if (isParameter) {
            parameterInputsInfo.push(info);
          } else {
            inputsInfo.push(info);
          }
        }
        if (prefix === 'output') {
          if (isParameter) {
            parameterOutputsInfo.push(info);
          } else {
            outputsInfo.push(info);
          }
        }
        if (isParameter) {
          parameterInfo.push(info);
        }
      }
    }
    return true;
  });

  if (inputsInfo.length > 0) {
    inputsString = [
      '**Inputs**',
      '```modelica',
      inputsInfo.join('\n'),
      '```'
    ].join('\n');
  }
  if (parameterInputsInfo.length > 0) {
    parameterInputsString = [
      '**Parameter Inputs**',
      '```modelica',
      parameterInputsInfo.join('\n'),
      '```'
    ].join('\n');
  }
  if (outputsInfo.length > 0) {
    outputsString = [
      '**Outputs**',
      '```modelica',
      outputsInfo.join('\n'),
      '```'
    ].join('\n');
  }
  if (parameterOutputsInfo.length > 0) {
    parameterOutputsString = [
      '**Parameter Outputs**',
      '```modelica',
      parameterOutputsInfo.join('\n'),
      '```'
    ].join('\n');
  }
  if (parameterInfo.length > 0) {
    parameterString = [
      '**Parameter**',
      '```modelica',
      parameterInfo.join('\n'),
      '```'
    ].join('\n');
  }

  return {
    inputsInfo: inputsString,
    outputsInfo: outputsString,
    parameterInfo: parameterString,
    parameterInputsInfo: parameterInputsString,
    parameterOutputsInfo: parameterOutputsString,
  };
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
