"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parser = void 0;
var Parser = require('tree-sitter');
var Modelica = require('../../tree_sitter_modelica_binding');
exports.parser = new Parser();
exports.parser.setLanguage(Modelica);
// Example Modelica code
var sourceCode = 'model SimpleModel Real x; equation x = 1.0; end SimpleModel;';
// Show example
console.log(parseSource(sourceCode));
//Function that parses the source code
function parseSource(src) {
    var tree = exports.parser.parse(src);
    return tree.rootNode.toString();
}
