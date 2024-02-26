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
export function extractHoverInformation(targetNode: SyntaxNode | null): string {

    if (!targetNode) {
        logger.debug('No target node found.');
        return '';
    }

    if (targetNode.type !== 'IDENT'){
        logger.debug('Target node is not an identifier.');
        return '';
    }

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
        return ''; // The targetNode is not the class name identifier.
    }

    // Extract the description_string if it exists.
    const descriptionNode = TreeSitterUtil.findFirst(classDefNode, n => n.type === 'description_string');
    const descriptionText = descriptionNode ? descriptionNode.firstChild?.text : null;

    return descriptionText ? `\n\n${descriptionText}` : `\n\n No description available.`;
}
