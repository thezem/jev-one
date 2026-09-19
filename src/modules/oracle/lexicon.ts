export interface OracleWord {
  id: string;
  label: string;
  meaning: string;
  aliases?: string[];
  metadata?: Record<string, unknown>;
}

export interface OracleCategory {
  id: string;
  label: string;
  description: string;
  words: OracleWord[];
}

export class OracleLexicon {
  readonly #categories = new Map<string, OracleCategory>();

  constructor(categories: OracleCategory[] = []) {
    for (const category of categories) this.addCategory(category);
  }

  addCategory(category: OracleCategory): this {
    if (!category.id.trim() || !category.words.length) throw new Error('Oracle categories require an ID and at least one word.');
    const wordIds = category.words.map((word) => word.id);
    if (new Set(wordIds).size !== wordIds.length) throw new Error(`Duplicate word IDs in category ${category.id}.`);
    this.#categories.set(category.id, structuredClone(category));
    return this;
  }

  addWord(categoryId: string, word: OracleWord): this {
    const category = this.#categories.get(categoryId);
    if (!category) throw new Error(`Unknown Oracle category: ${categoryId}`);
    if (category.words.some((existing) => existing.id === word.id)) throw new Error(`Duplicate Oracle word: ${categoryId}/${word.id}`);
    category.words.push(structuredClone(word));
    return this;
  }

  categories(): OracleCategory[] {
    return [...this.#categories.values()].map((category) => structuredClone(category));
  }

  category(id: string): OracleCategory {
    const category = this.#categories.get(id);
    if (!category) throw new Error(`Unknown Oracle category: ${id}`);
    return structuredClone(category);
  }

  get size(): number {
    return [...this.#categories.values()].reduce((sum, category) => sum + category.words.length, 0);
  }
}
