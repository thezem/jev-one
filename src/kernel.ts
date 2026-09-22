import { randomUUID } from 'node:crypto';
import { TraceLedger } from './ledger.js';
import type { DecisionStrength, JevProvider, PointRequest, PointResult, RankedChoice } from './types.js';

const normalize = (ids: string[], source: Record<string, number>): Record<string, number> => {
  const cleaned = Object.fromEntries(ids.map((id) => [id, Number.isFinite(source[id]) ? Math.max(0, source[id] ?? 0) : 0]));
  const total = Object.values(cleaned).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return Object.fromEntries(ids.map((id) => [id, 1 / ids.length]));
  return Object.fromEntries(Object.entries(cleaned).map(([id, value]) => [id, value / total]));
};

const diagnostics = (probabilities: number[]): { strength: DecisionStrength; margin: number; normalizedEntropy: number } => {
  const sorted = [...probabilities].sort((a, b) => b - a);
  const top = sorted[0] ?? 0;
  const margin = top - (sorted[1] ?? 0);
  const entropy = -probabilities.reduce((sum, value) => value > 0 ? sum + value * Math.log(value) : sum, 0);
  const normalizedEntropy = probabilities.length > 1 ? entropy / Math.log(probabilities.length) : 0;
  let strength: DecisionStrength = 'preferred';
  if (top >= 0.72 && margin >= 0.25) strength = 'decisive';
  else if (margin < 0.1) strength = 'close';
  else if (normalizedEntropy >= 0.82 || top < 0.4) strength = 'diffuse';
  return { strength, margin, normalizedEntropy };
};

export interface KernelOptions {
  maxChoices?: number;
  deadlineMs?: number;
  ledger?: TraceLedger;
}

export class PointKernel {
  readonly provider: JevProvider;
  readonly ledger: TraceLedger;
  readonly maxChoices: number;
  readonly deadlineMs: number;

  constructor(provider: JevProvider, options: KernelOptions = {}) {
    this.provider = provider;
    this.ledger = options.ledger ?? new TraceLedger();
    this.maxChoices = options.maxChoices ?? 50;
    this.deadlineMs = options.deadlineMs ?? 30_000;
  }

  async point<T>(request: PointRequest<T>): Promise<PointResult<T>> {
    const workflowId = request.trace?.workflowId ?? randomUUID();
    const ids = request.choices.map((choice) => choice.id);
    const maxChoices = request.limits?.maxChoices ?? this.maxChoices;
    if (!request.goal.trim() || !request.question.trim()) throw new Error('Point requests require a goal and question.');
    if (request.choices.length < 2) throw new Error('Point requests require at least two choices.');
    if (request.choices.length > maxChoices) throw new Error(`Point request has ${request.choices.length} choices; limit is ${maxChoices}.`);
    if (new Set(ids).size !== ids.length || ids.some((id) => !id.trim())) throw new Error('Choice IDs must be unique and non-empty.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.limits?.deadlineMs ?? this.deadlineMs);
    const started = performance.now();
    try {
      const raw = await this.provider.point({
        state: request.state === undefined
          ? `GOAL:\n${request.goal.trim()}\n\nCONTEXT:\n${request.context.trim() || 'none'}`
          : { goal: request.goal.trim(), context: request.state },
        question: request.question.trim(),
        ...(request.instructions !== undefined ? { instructions: request.instructions } : {}),
        choices: request.choices,
        signal: controller.signal,
      });
      if (!ids.includes(raw.selected)) throw new Error(`Provider selected unavailable choice: ${raw.selected}`);
      const distribution = normalize(ids, raw.probabilities);
      const ranking: RankedChoice<T>[] = request.choices
        .map((choice) => ({ choice, probability: distribution[choice.id] ?? 0, rank: 0 }))
        .sort((a, b) => b.probability - a.probability)
        .map((item, index) => ({ ...item, rank: index + 1 }));
      const selected = request.choices.find((choice) => choice.id === raw.selected)!;
      const decision = diagnostics(Object.values(distribution));
      const event = this.ledger.append({
        workflowId,
        ...(request.trace?.parentDecisionId ? { parentDecisionId: request.trace.parentDecisionId } : {}),
        type: 'point',
        module: request.module,
        payload: {
          goal: request.goal,
          question: request.question,
          ...(request.instructions !== undefined ? { instructions: request.instructions } : {}),
          choiceIds: ids,
          selected: selected.id,
          distribution,
          ...decision,
          provider: this.provider.id,
          ...(raw.model ? { model: raw.model } : {}),
        },
      });
      return {
        decisionId: event.id,
        workflowId,
        module: request.module,
        selected,
        probability: distribution[selected.id] ?? 0,
        distribution,
        ranking,
        ...decision,
        provider: this.provider.id,
        ...(raw.model ? { model: raw.model } : {}),
        elapsedMs: Math.round(performance.now() - started),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
