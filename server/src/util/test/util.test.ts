/*
 * This file is part of modelica-language-server.
 *
 * modelica-language-server is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * modelica-language-server is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with modelica-language-server. If not, see
 * <http://www.gnu.org/licenses/>.
 */

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
