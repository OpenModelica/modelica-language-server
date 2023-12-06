import Parser = require('tree-sitter');
import Modelica = require('tree-sitter-modelica');

export const parser = new Parser();
parser.setLanguage(Modelica);

// Example Modelica code
const sourceCode = 'model SimpleModel Real x; equation x = 1.0; end SimpleModel;';

// Show example
console.log(parseSource(sourceCode));

//Function that parses the source code
function parseSource(src: string) {
    const tree = parser.parse(src);
    return tree.rootNode.toString();
}