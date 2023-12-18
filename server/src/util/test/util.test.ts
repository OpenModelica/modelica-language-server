import * as assert from 'assert';

import { initializeParser } from '../../parser';
import * as TreeSitterUtil from '../tree-sitter';

describe('getIdentifier', () => {
  it('Identifier of type class', async () => {
    const parser = await initializeParser();
    const tree = parser.parse("type Temperature = Real(unit = \"K \");");
    const classNode = tree.rootNode.childForFieldName('storedDefinitions')!.childForFieldName('classDefinition')!;
    const name = TreeSitterUtil.getIdentifier(classNode);

    assert.equal(name, 'Temperature');
  });
});
