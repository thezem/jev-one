import type { PointKernel } from './kernel.js';
import type { JevInput, PointResult } from './types.js';

export interface DecisionCard<T = unknown> {
  id: string;
  label: string;
  description?: string;
  criteria?: JevInput | null;
  value: T;
  metadata?: Record<string, unknown>;
}

export interface CardQuestion<T = unknown> {
  goal?: string;
  context: JevInput;
  instructions: JevInput;
  cards: DecisionCard<T>[];
  module?: string;
}

export interface CardAnswer<T = unknown> {
  id: string;
  card: DecisionCard<T>;
  decision: PointResult<DecisionCard<T>>;
}

const readable = (input: JevInput): string => {
  if (typeof input === 'string') return input;
  if ('question' in input && typeof input.question === 'string') return input.question;
  return JSON.stringify(input);
};

const criterionFor = <T>(card: DecisionCard<T>): JevInput | null => {
  if (card.criteria === null) return null;
  if (card.criteria === undefined) return `${card.label}: ${card.description ?? 'No additional description.'}`;
  return {
    label: card.label,
    ...(card.description ? { description: card.description } : {}),
    criteria: card.criteria,
  };
};

/** Point at evidence-rich, semantically named alternatives. Unlike the fixed
 * number board, cards keep their own IDs and preserve JSON structure through
 * the provider boundary. */
export class DecisionCards {
  readonly #kernel: PointKernel;
  constructor(kernel: PointKernel) { this.#kernel = kernel; }

  async choose<T>(request: CardQuestion<T>): Promise<CardAnswer<T>> {
    const ids = request.cards.map((card) => card.id);
    if (request.cards.length < 2) throw new Error('Decision cards require at least two cards.');
    if (new Set(ids).size !== ids.length || ids.some((id) => !id.trim())) {
      throw new Error('Decision card IDs must be unique and non-empty.');
    }
    const decision = await this.#kernel.point({
      goal: request.goal ?? 'Point to the decision card that best satisfies the instructions.',
      context: typeof request.context === 'string' ? request.context : JSON.stringify(request.context),
      question: readable(request.instructions),
      state: request.context,
      instructions: request.instructions,
      module: request.module ?? 'cards',
      choices: request.cards.map((card) => ({
        id: card.id,
        label: card.label,
        description: card.description ?? 'Structured decision card.',
        criteria: criterionFor(card),
        kind: 'judgment',
        value: card,
        ...(card.metadata ? { metadata: card.metadata } : {}),
      })),
    });
    return { id: decision.selected.id, card: decision.selected.value!, decision };
  }
}
