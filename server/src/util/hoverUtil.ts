import { SyntaxNode } from 'web-tree-sitter';
import * as TreeSitterUtil from './tree-sitter';
import * as LSP from 'vscode-languageserver';

/**
 * Extracts hover information for a Modelica class or package.
 * 
 * @param rootNode The root node of the AST for the current document.
 * @param position The position of the cursor in the document.
 * @returns Markdown formatted string with hover information.
 */
export function extractHoverInformation(targetNode: SyntaxNode | null): string | null {
    // Find the node at the cursor's position.

    if (!targetNode) {
        return null;
    }

    // Find the parent class_definition node.
    const classDefNode = TreeSitterUtil.findParent(targetNode, n => n.type === 'class_definition');

    if (!classDefNode) {
        return null;
    }

    // Extract the description_string if it exists.
    const descriptionNode = TreeSitterUtil.findFirst(classDefNode, n => n.type === 'description_string');
    const descriptionText = descriptionNode ? descriptionNode.firstChild?.text : null;

    // Format as Markdown (simple example).
    return descriptionText ? descriptionText : "No description available.";
}
