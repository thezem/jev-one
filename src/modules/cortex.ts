import type { PointKernel } from '../kernel.js';
import type { PointChoice, PointResult } from '../types.js';

export interface SequenceDecision<T = unknown> {
  id: string;
  question: string;
  context?: string;
  choices: PointChoice<T>[];
}

export interface SequenceStep<T = unknown> {
  id: string;
  result: PointResult<T>;
  establishedContext: string;
}

export class CortexModule {
  readonly #kernel: PointKernel;
  constructor(kernel: PointKernel) { this.#kernel = kernel; }

  choose<T>(goal: string, context: string, question: string, choices: PointChoice<T>[]): Promise<PointResult<T>> {
    return this.#kernel.point({ goal, context, question, choices, module: 'cortex.choose' });
  }

  async boolean(goal: string, context: string, question: string): Promise<PointResult<boolean>> {
    return this.choose(goal, context, question, [
      { id: 'true', label: 'TRUE', description: 'The statement is supported by the supplied context.', kind: 'judgment', value: true },
      { id: 'false', label: 'FALSE', description: 'The statement is not supported by the supplied context.', kind: 'judgment', value: false },
    ]);
  }

  async score(goal: string, context: string, question: string, levels: Array<{ id: string; label: string; description: string; value: number }>): Promise<PointResult<number>> {
    return this.choose(goal, context, question, levels.map((level) => ({ ...level, kind: 'judgment' as const })));
  }

  async sequence<T>(goal: string, startingContext: string, decisions: SequenceDecision<T>[]): Promise<{ context: string; steps: SequenceStep<T>[] }> {
    let context = startingContext.trim();
    const steps: SequenceStep<T>[] = [];
    for (const decision of decisions) {
      const result = await this.choose(goal, [context, decision.context].filter(Boolean).join('\n\n'), decision.question, decision.choices);
      const record = [
        '[ESTABLISHED JEV DECISION]',
        `Decision: ${decision.id}`,
        `Question: ${decision.question}`,
        `Selected: ${result.selected.label}`,
        `Meaning: ${result.selected.description}`,
        `Probability: ${result.probability.toFixed(4)}`,
      ].join('\n');
      context = `${context}\n\n${record}`.trim();
      steps.push({ id: decision.id, result, establishedContext: record });
    }
    return { context, steps };
  }
}
