import { pointAcross } from '../../hierarchical.js';
import type { PointKernel } from '../../kernel.js';
import type { PointResult } from '../../types.js';
import { DEFAULT_ORACLE_CATEGORIES } from './default-lexicon.js';
import { OracleLexicon, type OracleCategory, type OracleWord } from './lexicon.js';

export interface OracleAnswer {
  category: OracleCategory;
  word: OracleWord;
  categoryDecision: PointResult<OracleCategory> | null;
  wordDecision: PointResult<OracleWord> | null;
  examinedWords: number;
}

export class OracleModule {
  readonly lexicon: OracleLexicon;
  readonly #kernel: PointKernel;

  constructor(kernel: PointKernel, lexicon = new OracleLexicon(DEFAULT_ORACLE_CATEGORIES)) {
    this.#kernel = kernel;
    this.lexicon = lexicon;
  }

  async ask(context: string, question: string, goal = 'Answer the question with the most useful universal semantic operator.'): Promise<OracleAnswer> {
    const categories = this.lexicon.categories();
    const categoryResult = await pointAcross(this.#kernel, {
      goal, context, question: 'Which semantic territory contains the most useful direct answer?', module: 'oracle.category',
      choices: categories.map((category) => ({ id: category.id, label: category.label, description: category.description, kind: 'meaning', value: category })),
    });
    const category = categoryResult.selected.value!;
    const wordResult = await pointAcross(this.#kernel, {
      goal,
      context: `${context}\n\nSelected semantic territory: ${category.label} — ${category.description}`,
      question,
      module: 'oracle.word',
      choices: category.words.map((word) => ({ id: word.id, label: word.label, description: word.meaning, kind: 'meaning', value: word })),
    });
    return {
      category,
      word: wordResult.selected.value!,
      categoryDecision: categoryResult.final,
      wordDecision: wordResult.final,
      examinedWords: this.lexicon.size,
    };
  }
}
