import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { OracleLexicon, type OracleCategory } from '../modules/oracle/lexicon.js';

export async function loadLexiconDirectory(directory: string): Promise<OracleLexicon> {
  const lexicon = new OracleLexicon();
  const visit = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        const category = JSON.parse(await readFile(target, 'utf8')) as OracleCategory;
        lexicon.addCategory(category);
      }
    }
  };
  await visit(path.resolve(directory));
  return lexicon;
}
