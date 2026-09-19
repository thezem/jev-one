import type { PointKernel } from '../kernel.js';
import type { PointResult } from '../types.js';

export interface IndexedItem<T = unknown> {
  label: string;
  description: string;
  value: T;
  metadata?: Record<string, unknown>;
}

export interface IndexedAnswer<T = unknown> {
  number: number;
  index: number;
  item: IndexedItem<T>;
  decision: PointResult<IndexedItem<T>>;
}

export interface IndexedQuestion<T = unknown> {
  goal?: string;
  context: string;
  question: string;
  items: IndexedItem<T>[];
  module?: string;
}

/** A permanent 1-25 pointing board. The numbers stay stable while callers bind
 * them to the currently visible files, elements, commands, or other legal items. */
export class IndexedVocabulary {
  readonly #kernel: PointKernel;
  constructor(kernel: PointKernel) { this.#kernel = kernel; }

  async choose<T>(request: IndexedQuestion<T>): Promise<IndexedAnswer<T>> {
    if (request.items.length < 2 || request.items.length > 25) throw new Error('Indexed vocabulary requires 2-25 items.');
    const decision = await this.#kernel.point({
      goal: request.goal ?? 'Point to the numbered item that best answers the question.',
      context: request.context,
      question: `${request.question} Answer by pointing to one number from 1 to ${request.items.length}.`,
      module: request.module ?? 'vocabulary.indexed',
      choices: request.items.map((item, index) => ({
        id: String(index + 1),
        label: String(index + 1),
        description: `${item.label}: ${item.description}`,
        kind: 'navigation',
        value: item,
        metadata: { index, ...(item.metadata ?? {}) },
      })),
    });
    const number = Number(decision.selected.id);
    return { number, index: number - 1, item: decision.selected.value!, decision };
  }
}
