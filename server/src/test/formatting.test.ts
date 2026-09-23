/*
 * This file is part of OpenModelica.
 *
 * Copyright (c) 1998-2026, Open Source Modelica Consortium (OSMC),
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

import assert from 'node:assert/strict';
import { Node, Parser } from 'web-tree-sitter';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FormattingOptions, Range } from 'vscode-languageserver/node';
import { initializeParser } from '../parser';
import { formatDocument } from '../formatting';

describe('Modelica formatting', () => {
  let parser: Parser;
  before(async () => { parser = await initializeParser(); });
  after(() => parser.delete());

  function format(text: string, options: FormattingOptions = { tabSize: 2, insertSpaces: true }, range?: Range): string {
    const document = TextDocument.create('untitled:format.mo', 'modelica', 1, text);
    return TextDocument.applyEdits(document, formatDocument(parser, document, options, range));
  }

  function tokens(node: Node): string[] {
    if (node.childCount === 0 || ['STRING', 'IDENT', 'comment', 'BLOCK_COMMENT'].includes(node.type)) {
      return [JSON.stringify([node.type, node.text])];
    }
    return node.children.flatMap(tokens);
  }

  function assertPreserved(source: string, result: string): void {
    const before = parser.parse(source);
    const after = parser.parse(result);
    try {
      assert.ok(before && after);
      // Reject invalid fixtures: a formatter returning no edits must not make
      // an unsupported construct look like a successfully formatted one.
      assert.equal(before.rootNode.hasError, false, 'fixture must parse without errors');
      assert.equal(after.rootNode.hasError, false, 'formatted result must parse without errors');
      assert.deepEqual(tokens(after.rootNode), tokens(before.rootNode), 'every token must be preserved');
      assert.equal(after.rootNode.toString(), before.rootNode.toString(), 'syntax structure must be preserved');
    } finally {
      before?.delete();
      after?.delete();
    }
  }

  it('formats declarations and equations with two-space MSL indentation', () => {
    const source = 'within A;\nmodel M\nReal x(start=1,fixed=true);\nequation\nder(x)=-x;\nend M;';
    const expected = 'within A;\nmodel M\n  Real x(start = 1, fixed = true);\nequation\n  der(x) = -x;\nend M;\n';
    assert.equal(format(source), expected);
    assert.equal(format(expected), expected);
  });

  it('expands single-line classes, nested classes and algorithms', () => {
    const source = 'package P model M Real x; algorithm if x>0 then for i in 1:3 loop x:=x+i; end for; elseif x<0 then x:=0; else x:=1; end if; end M; end P;';
    const expected = `package P
  model M
    Real x;
  algorithm
    if x > 0 then
      for i in 1:3 loop
        x := x + i;
      end for;
    elseif x < 0 then
      x := 0;
    else
      x := 1;
    end if;
  end M;
end P;
`;
    assert.equal(format(source), expected);
    assert.equal(format(expected), expected);
  });

  it('honors tabs and custom indentation widths', () => {
    const source = 'model M Real x; end M;';
    assert.equal(format(source, { tabSize: 4, insertSpaces: true }), 'model M\n    Real x;\nend M;\n');
    assert.equal(format(source, { tabSize: 4, insertSpaces: false }), 'model M\n\tReal x;\nend M;\n');
  });

  it('preserves strings, comments and declaration order', () => {
    const source = `function F
output Real y; // end if; = ,
input Real x;
algorithm
/* then\n   end F; */
y:=x;
annotation(Documentation(info="<html>\n  <p> a= b, c </bad>\n</html>"));
end F;`;
    const result = format(source);
    assert.ok(result.includes('// end if; = ,\n'));
    assert.ok(result.includes('/* then\n   end F; */'));
    assert.ok(result.includes('"<html>\n  <p> a= b, c </bad>\n</html>"'));
    assert.ok(result.includes('y := x;'));
    assert.ok(result.indexOf('output Real') < result.indexOf('input Real'));
    assert.equal(format(result), result);
  });

  it('formats only selected lines using the surrounding class context', () => {
    const source = 'package P\nmodel M\nReal x=1;\nReal y=2;\nend M;\nend P;\n';
    const range = Range.create(2, 2, 3, 0);
    assert.equal(format(source, undefined, range), 'package P\nmodel M\n    Real x = 1;\nReal y=2;\nend M;\nend P;\n');
  });

  it('does not edit inside a multiline documentation string selected on its own', () => {
    const source = 'model M\nannotation(Documentation(info="<html>\n <p> x=1 </p>\n</html>"));\nend M;';
    assert.equal(format(source, undefined, Range.create(2, 0, 3, 0)), source);
  });

  it('leaves invalid Modelica untouched', () => {
    const source = 'model M Real x = ; end M;';
    assert.equal(format(source), source);
    // Quoted identifiers are not yet accepted by the bundled grammar.
    const quoted = "model M Real 'x y'=1; end M;";
    assert.equal(format(quoted), quoted);
  });

  it('handles CRLF and UTF-16 offsets', () => {
    const source = 'model M "å😀"\r\nReal x=1;\r\nend M;\r\n';
    const result = 'model M "å😀"\r\n  Real x = 1;\r\nend M;\r\n';
    assert.equal(format(source), result);
    assert.equal(format(result), result);
  });

  it('wraps long argument lists and formats annotation indentation', () => {
    const source = 'model M\nReal x(start=1,fixed=true,min=0,max=100,nominal=20);\nannotation(Icon(graphics={Rectangle(extent={{-100,-100},{100,100}})}));\nend M;';
    const options = { tabSize: 2, insertSpaces: true, printWidth: 40 };
    const result = format(source, options);
    assert.ok(result.includes(',\n'));
    assert.ok(result.includes('\n  annotation (Icon('));
    assert.equal(format(result, options), result);
    const tree = parser.parse(result);
    assert.equal(tree?.rootNode.hasError, false);
    tree?.delete();
  });

  it('distinguishes array end, if expressions, short classes and matrix rows from blocks', () => {
    const source = 'model M\ntype T=Real;\nReal x[2,2]=[1,2;3,4];\nReal y=if x[1,end]>0 then 1 else -1;\nend M;';
    const result = format(source);
    assert.ok(result.includes('type T = Real;'));
    assert.ok(result.includes('[1, 2; 3, 4]'));
    assert.ok(result.includes('if x[1, end] > 0 then 1 else -1;'));
    assert.equal(format(result), result);
  });

  it('indents initial sections, access sections, when branches and while loops', () => {
    const source = 'model M protected Real x; public Real y; initial equation x=0; equation when y>0 then x=1; elsewhen y<0 then x=2; end when; initial algorithm while x<3 loop x:=x+1; end while; end M;';
    const expected = `model M
protected
  Real x;
public
  Real y;
initial equation
  x = 0;
equation
  when y > 0 then
    x = 1;
  elsewhen y < 0 then
    x = 2;
  end when;
initial algorithm
  while x < 3 loop
    x := x + 1;
  end while;
end M;
`;
    assert.equal(format(source), expected);
    assert.equal(format(expected), expected);
  });

  it('respects explicit final-newline preferences', () => {
    const source = 'model M\nend M;';
    assert.equal(format(source, { tabSize: 2, insertSpaces: true, insertFinalNewline: false }), source);
    assert.equal(format(source + '\n\n\n', { tabSize: 2, insertSpaces: true, trimFinalNewlines: true }), source + '\n');
  });

  it('indents class and component descriptions on continuation lines', () => {
    const source = 'model M\n"Description"\nReal x\n"Variable description";\nend M;';
    const expected = 'model M\n  "Description"\n  Real x\n    "Variable description";\nend M;\n';
    assert.equal(format(source), expected);
    assert.equal(format(expected), expected);
  });

  const constructCases = [
    {
      name: 'enumerations, type aliases and derivative functions',
      source: 'package Types type State=enumeration(off "Off",on "On"); type Vector=Real[3]; function df=der(f,x); end Types;',
      expected: `package Types
  type State = enumeration(off "Off", on "On");
  type Vector = Real[3];
  function df = der(f, x);
end Types;
`,
    },
    {
      name: 'redeclare, each, final and constrainedby modifications',
      source: 'model M replaceable package Medium=BaseMedium constrainedby PartialMedium; extends Base(redeclare package Medium=Water,each final x(start=1)); end M;',
      expected: `model M
  replaceable package Medium = BaseMedium constrainedby PartialMedium;
  extends Base(redeclare package Medium = Water, each final x(start = 1));
end M;
`,
    },
    {
      name: 'class extends with protected elements',
      source: 'package P redeclare model extends Base(k=2) protected Real x; equation x=k; end Base; end P;',
      expected: `package P
  redeclare model extends Base(k = 2)
  protected
    Real x;
  equation
    x = k;
  end Base;
end P;
`,
    },
    {
      name: 'external functions with language and library annotations',
      source: 'function F input Real x; output Real y; external "C" y=f(x) annotation(Library="m"); end F;',
      expected: `function F
  input Real x;
  output Real y;
  external "C" y = f(x) annotation (Library = "m");
end F;
`,
    },
    {
      name: 'qualified, renamed, wildcard and selective imports',
      source: 'package P import SI=Modelica.Units.SI; import Modelica.Math.*; import Modelica.Math.{sin,cos}; end P;',
      expected: `package P
  import SI = Modelica.Units.SI;
  import Modelica.Math.*;
  import Modelica.Math.{sin, cos};
end P;
`,
    },
    {
      name: 'connectors, flow and stream prefixes, and connect equations',
      source: 'package P connector Port flow Real m; stream Real h; end Port; model M Port a,b; equation connect(a,b); end M; end P;',
      expected: `package P
  connector Port
    flow Real m;
    stream Real h;
  end Port;
  model M
    Port a, b;
  equation
    connect(a, b);
  end M;
end P;
`,
    },
    {
      name: 'conditional components, inner and outer declarations',
      source: 'model M parameter Boolean enabled=true; inner Real shared=1; outer Real other; Port p if enabled; end M;',
      expected: `model M
  parameter Boolean enabled = true;
  inner Real shared = 1;
  outer Real other;
  Port p if enabled;
end M;
`,
    },
    {
      name: 'array comprehensions, reductions, slices and dotted operators',
      source: 'model M Real x[3]={i^2 for i in 1:3}; Real y=sum(x[i] for i in 1:3); Real z[3]=x.*x.+x./2; equation x[1:2:end]=x[:,1]; end M;',
      expected: `model M
  Real x[3] = {i ^ 2 for i in 1:3};
  Real y = sum(x[i] for i in 1:3);
  Real z[3] = x .* x .+ x ./ 2;
equation
  x[1:2:end] = x[:, 1];
end M;
`,
    },
    {
      name: 'tuple assignment with omitted outputs, break and return',
      source: 'function F input Real x; output Real y; protected Real z; algorithm (y,,z):=f(x); for i in 1:3 loop if i>1 then break; end if; end for; return; end F;',
      expected: `function F
  input Real x;
  output Real y;
protected
  Real z;
algorithm
  (y,, z) := f(x);
  for i in 1:3 loop
    if i > 1 then
      break;
    end if;
  end for;
  return;
end F;
`,
    },
    {
      name: 'if expressions with elseif, unary signs and logical operators',
      source: 'model M Real x=if not (a>0 and b<0) then -1 elseif a==0 or b<>1 then +2 else 3; end M;',
      expected: `model M
  Real x = if not (a > 0 and b < 0) then -1 elseif a == 0 or b <> 1 then +2 else 3;
end M;
`,
    },
    {
      name: 'empty branches and nested equation control flow',
      source: 'model M Real x; equation for i in 1:2 loop if i==1 then elseif i==2 then x=2; else end if; end for; end M;',
      expected: `model M
  Real x;
equation
  for i in 1:2 loop
    if i == 1 then
    elseif i == 2 then
      x = 2;
    else
    end if;
  end for;
end M;
`,
    },
    {
      name: 'algorithm when branches with sample and pre',
      source: 'model M discrete Real x; algorithm when initial() then x:=0; elsewhen sample(0,1) then x:=pre(x)+1; end when; end M;',
      expected: `model M
  discrete Real x;
algorithm
  when initial() then
    x := 0;
  elsewhen sample(0, 1) then
    x := pre(x) + 1;
  end when;
end M;
`,
    },
  ];

  for (const { name, source, expected } of constructCases) {
    it(`formats ${name}`, () => {
      assert.equal(format(source), expected);
      assertPreserved(source, expected);
    });

    for (const options of [
      { tabSize: 2, insertSpaces: true },
      { tabSize: 4, insertSpaces: true, printWidth: 40 },
      { tabSize: 4, insertSpaces: false, printWidth: 40 },
    ]) {
      it(`preserves ${name} and is stable with ${JSON.stringify(options)}`, () => {
        const result = format(source, options);
        assert.notEqual(result, source, 'fixture must exercise formatting');
        assertPreserved(source, result);
        assert.equal(format(result, options), result, 'second pass must make no changes');
      });
    }
  }

  it('preserves escaped strings, concatenated documentation and comment-like text', () => {
    const source = String.raw`model M
String s="quote: \" slash: \\ // /* end M;";
annotation(Documentation(info="<html><p title=\"a=b\">"+"text, end if;</p></html>"));
end M;`;
    const result = format(source);
    assert.notEqual(result, source);
    assertPreserved(source, result);
    assert.equal(format(result), result);
  });

  it('preserves comments between modifiers, operators and arguments', () => {
    const source = `model M
parameter /* prefix */ Real x(start=/* value */1,fixed=true); // trailing
equation
x=/* operator */f(1, // argument
2);
/* closing */
end M;`;
    const result = format(source);
    assert.notEqual(result, source);
    assertPreserved(source, result);
    assert.ok(result.includes('// argument\n'));
    assert.equal(format(result), result);
  });

  it('formats a nested branch selection with tabs, CRLF and preceding Unicode', () => {
    const source = 'model M "å😀"\r\nReal x;\r\nalgorithm\r\nwhen initial() then\r\nx:=f(1,2);\r\nend when;\r\nend M;\r\n';
    const options = { tabSize: 4, insertSpaces: false };
    const range = Range.create(4, 2, 5, 0);
    const result = format(source, options, range);
    assert.equal(result, source.replace('x:=f(1,2);', '\t\tx := f(1, 2);'));
    assertPreserved(source, result);
    assert.equal(format(result, options, range), result);
  });

  it('formats through the final selected line without a trailing newline', () => {
    const source = 'model M\nReal x;\n  end M;';
    const result = format(source, undefined, Range.create(2, 2, 2, 8));
    assert.equal(result, 'model M\nReal x;\nend M;');
    assertPreserved(source, result);
  });

  it('leaves an empty selection untouched', () => {
    const source = 'model M\nReal x=1;\nend M;';
    assert.equal(format(source, undefined, Range.create(1, 0, 1, 0)), source);
  });
});
