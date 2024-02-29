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

    const getClassDescription = extractClassDescription(classDefNode, targetNode);
    logger.debug(`Class description: ${getClassDescription}`);
    return `${getClassDescription}`;
}

function extractClassDescription(classDefNode: SyntaxNode, targetNode: SyntaxNode): string {

  // Check if the targetNode is the first IDENT child of the class_definition, indicating it's the class name.
  const isClassName = classDefNode.namedChildren.some((child, index) => 
  child.type === 'long_class_specifier' && 
  child.firstChild?.type === 'IDENT' && 
  child.firstChild?.text === targetNode.text);

  if (!isClassName) {
    logger.debug('Target node is not the class name identifier.');
    return ''; // The targetNode is not the class name identifier.
  }

  // Extract the description_string if it exists.
  const descriptionNode = TreeSitterUtil.findFirst(classDefNode, n => n.type === 'description_string');
  const descriptionText = descriptionNode ? descriptionNode.firstChild?.text : null;

  return descriptionText ? `\n${descriptionText}` : '\nNo description available.';
}

function extractInputs(classDefNode: SyntaxNode, targetNode: SyntaxNode): string {
  // Placeholder for future extensions
  return '';
}

/*
function extractHoverInformation(ast: Parser.SyntaxNode, position: LSP.Position): string {
  let hoverMarkdown = "";

  // Extract description
  const description = getDescription(ast, position);
  if (description) {
      hoverMarkdown += `**Description:** ${description}\n\n`;
  }

  // Placeholder for future extensions
  // const inputs = getInputs(ast, position);
  // const outputs = getOutputs(ast, position);
  // const parameters = getParameters(ast, position);

  // Add to Markdown as these features are implemented
  // if (inputs) { hoverMarkdown += `**Inputs:** ${inputs}\n\n`; }
  // if (outputs) { hoverMarkdown += `**Outputs:** ${outputs}\n\n`; }
  // if (parameters) { hoverMarkdown += `**Parameters:** ${parameters}\n\n`; }

  return hoverMarkdown;
}

export function extractHoverInformation(classDefNode: SyntaxNode): string {
  // Initialize Markdown content with the class description
  let markdownContent = `**Description:** ${getClassDescription(classDefNode)}\n\n`;

  // Variables to store inputs, outputs, and parameters
  let inputs: { identifier: string, description: string }[] = [];
  let outputs: { identifier: string, description: string }[] = [];
  let parameters: { identifier: string, description: string }[] = [];

  // Traverse the class definition's children to find relevant nodes
    TreeSitterUtil.forEach(classDefNode, (node) => {
      if (node.type === 'component_clause') {
        const identifier = TreeSitterUtil.getIdentifier(node);
        const description = getComponentDescription(node);

        if(!identifier) return false; // Skip if no identifier is found (e.g. for unnamed components

        if (node.text.includes('input')) {
          inputs.push({ identifier, description: description ?? '' });
        } else if (node.text.includes('output')) {
          outputs.push({ identifier, description: description ?? '' });
        } else if (node.text.includes('parameter')) {
          parameters.push({ identifier, description: description ?? '' });
        }
      }
      return true; // Continue traversal
    });

  // Format and add inputs, outputs, and parameters to Markdown content
  if (inputs.length > 0) {
      markdownContent += formatComponentSection("Inputs", inputs);
  }
  if (outputs.length > 0) {
      markdownContent += formatComponentSection("Outputs", outputs);
  }
  if (parameters.length > 0) {
      markdownContent += formatComponentSection("Parameters", parameters);
  }

  return markdownContent;
}

// Helper function to format sections for inputs, outputs, and parameters
function formatComponentSection(title: string, components: Array<{identifier: string, description: string}>): string {
  let section = `**${title}:**\n`;
  components.forEach(comp => {
      section += `- ${comp.identifier}: ${comp.description}\n`;
  });
  return section + "\n"; // Add extra newline for spacing
}

// Assume getClassDescription and getComponentDescription are implemented to extract descriptions

/**
 * Extracts the class description from a class_definition node.
 *
 * @param classDefNode The class definition syntax node.
 * @returns The description text if available, otherwise a default message.
 *
function getClassDescription(classDefNode: SyntaxNode): string {
  // Find the description_string node directly under the class definition
  const descriptionNode = classDefNode.namedChildren.find(child => child.type === 'description_string');
  
  // If a description_string node is found, return its text content
  if (descriptionNode && descriptionNode.firstChild) {
      return descriptionNode.firstChild.text.trim();
  }

  // Default message if no description is available
  return "No class description available.";
}

/**
 * Extracts the description for a component (input, output, parameter) from its node.
 *
 * @param componentNode The syntax node for the component.
 * @returns The description text if available, otherwise a default message.
 *
function getComponentDescription(componentNode: SyntaxNode): string {
  // Assuming descriptions are in comments directly above the component declaration
  let description = "No description available."; // Default message

  // Attempt to find a comment node immediately preceding the componentNode
  let precedingNode = componentNode.previousSibling;
  while (precedingNode) {
      if (precedingNode.type === 'description_string') {
          // If a comment is found, use its text as the description
          description = precedingNode.text.trim();
          break;
      }
      precedingNode = precedingNode.previousSibling;
  }

  return description;
}*/
