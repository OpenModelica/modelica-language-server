import { Node as SyntaxNode } from 'web-tree-sitter';
import * as TreeSitterUtil from './tree-sitter';
import { logger } from './logger';

/**
 * Extracts hover information for a `class_definition` syntax node.
 *
 * Returns Markdown-formatted documentation including the class description,
 * inputs, outputs, and parameters.
 *
 * @param classDefNode  A `class_definition` syntax node.
 * @returns Hover content in Markdown, or null if unavailable.
 */
export function extractHoverInformation(classDefNode: SyntaxNode): string | null {
  if (classDefNode.type !== 'class_definition') {
    logger.debug('extractHoverInformation: Node is not a class_definition.');
    return null;
  }

  const classSpecifier = classDefNode.childForFieldName('classSpecifier');
  const nameNode = classSpecifier?.childForFieldName('identifier');
  if (!nameNode) {
    logger.debug('extractHoverInformation: No identifier found in class_definition.');
    return null;
  }

  const className = nameNode.text;
  const classDescription = TreeSitterUtil.getDescriptionString(classDefNode);
  const { inputsInfo, outputsInfo, parameterInfo, parameterInputsInfo, parameterOutputsInfo } =
    extractComponentInformation(classDefNode);

  const classDefinition = [
    TreeSitterUtil.getClassPrefixes(classDefNode),
    className,
    classDescription,
  ]
    .filter((e) => e)
    .join(' ')
    .trim();

  return [
    '```modelica',
    classDefinition,
    '```',
    '---',
    inputsInfo,
    parameterInputsInfo,
    outputsInfo,
    parameterOutputsInfo,
    parameterInfo,
  ].join('\n');
}

function extractComponentInformation(classDefNode: SyntaxNode): {
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

  TreeSitterUtil.forEach(classDefNode, (node) => {
    if (node.type === 'component_clause') {
      const prefix = TreeSitterUtil.getPrefix(node);
      const isParameter = TreeSitterUtil.isParameter(node);
      if (prefix !== undefined || isParameter) {
        const typeSpecifierNode = node.childForFieldName('typeSpecifier');
        const typeSpecifier = typeSpecifierNode ? typeSpecifierNode.text : 'Unknown Type';

        const componentDeclarationNode = node.childForFieldName('componentDeclarations');
        const declarationNode =
          componentDeclarationNode?.firstChild?.childForFieldName('declaration');
        const identifier = declarationNode ? declarationNode.text : 'Unknown Identifier';

        const descriptionNode =
          componentDeclarationNode?.firstChild?.childForFieldName('descriptionString');
        const description = descriptionNode ? descriptionNode.text : '';

        const info =
          [isParameter ? 'parameter' : undefined, prefix, typeSpecifier, identifier, description]
            .filter((e) => e !== undefined)
            .join(' ') + ';';

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

  return {
    inputsInfo: formatSection('**Inputs**', inputsInfo),
    parameterInputsInfo: formatSection('**Parameter Inputs**', parameterInputsInfo),
    outputsInfo: formatSection('**Outputs**', outputsInfo),
    parameterOutputsInfo: formatSection('**Parameter Outputs**', parameterOutputsInfo),
    parameterInfo: formatSection('**Parameter**', parameterInfo),
  };
}

function formatSection(header: string, lines: string[]): string | undefined {
  if (lines.length === 0) {
    return undefined;
  }
  return [header, '```modelica', lines.join('\n'), '```'].join('\n');
}
