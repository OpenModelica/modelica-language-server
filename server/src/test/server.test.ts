import { initializeParser } from '../parser';
import * as Mocha from 'mocha';

describe('Modelica tree-sitter parser', () => {
  it('Initialize parser', async () => {
    const parser = await initializeParser();
  });
});
