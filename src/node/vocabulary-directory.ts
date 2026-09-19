import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Vocabulary } from '../vocabulary/types.js';
import { VocabularyRegistry } from '../vocabulary/registry.js';

export interface LoadVocabularyDirectoryOptions { maxDepth?: number }

export async function loadVocabularyDirectory(root: string, options: LoadVocabularyDirectoryOptions = {}): Promise<Vocabulary[]> {
  const maxDepth = options.maxDepth ?? 6;
  const found: Vocabulary[] = [];
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > maxDepth) throw new Error(`Vocabulary directory exceeded maxDepth ${maxDepth}.`);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path, depth + 1);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === '.json') {
        found.push(JSON.parse(await readFile(path, 'utf8')) as Vocabulary);
      }
    }
  };
  await visit(root, 0);
  new VocabularyRegistry().registerMany(found);
  return found;
}
