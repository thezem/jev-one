import type { Vocabulary } from './types.js';

const validate = (vocabulary: Vocabulary): void => {
  if (!vocabulary.id.trim() || !vocabulary.label.trim() || !vocabulary.description.trim()) throw new Error('Vocabulary requires an id, label, and description.');
  if (vocabulary.entries.length < 2) throw new Error(`Vocabulary "${vocabulary.id}" requires at least two entries.`);
  const ids = vocabulary.entries.map((entry) => entry.id);
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) throw new Error(`Vocabulary "${vocabulary.id}" entry IDs must be unique and non-empty.`);
  for (const entry of vocabulary.entries) {
    if (!entry.label.trim() || !entry.meaning.trim()) throw new Error(`Vocabulary entry "${entry.id}" requires a label and meaning.`);
  }
};

export class VocabularyRegistry {
  readonly #items = new Map<string, Vocabulary>();

  register(vocabulary: Vocabulary): this {
    validate(vocabulary);
    this.#items.set(vocabulary.id, structuredClone(vocabulary));
    return this;
  }

  registerMany(vocabularies: Vocabulary[]): this {
    for (const vocabulary of vocabularies) this.register(vocabulary);
    return this;
  }

  get(id: string): Vocabulary {
    const vocabulary = this.#items.get(id);
    if (!vocabulary) throw new Error(`Unknown vocabulary: ${id}`);
    return structuredClone(vocabulary);
  }

  has(id: string): boolean { return this.#items.has(id); }
  list(): Vocabulary[] { return [...this.#items.values()].map((item) => structuredClone(item)); }
}
