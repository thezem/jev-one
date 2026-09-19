import type { PointKernel } from './kernel.js';
import type { PointChoice, PointResult } from './types.js';

export interface HierarchicalPointRequest<T> {
  goal: string;
  context: string;
  question: string;
  choices: PointChoice<T>[];
  module: string;
  workflowId?: string;
  batchSize?: number;
}

export interface HierarchicalPointResult<T> {
  selected: PointChoice<T>;
  final: PointResult<T> | null;
  rounds: PointResult<T>[];
  examined: number;
}

export async function pointAcross<T>(kernel: PointKernel, request: HierarchicalPointRequest<T>): Promise<HierarchicalPointResult<T>> {
  if (request.choices.length === 0) throw new Error('Hierarchical pointing requires at least one choice.');
  if (request.choices.length === 1) return { selected: request.choices[0]!, final: null, rounds: [], examined: 1 };
  const batchSize = Math.min(request.batchSize ?? 40, kernel.maxChoices - 1);
  if (request.choices.length <= kernel.maxChoices) {
    const final = await kernel.point({
      goal: request.goal, context: request.context, question: request.question,
      choices: request.choices, module: request.module,
      ...(request.workflowId ? { trace: { workflowId: request.workflowId } } : {}),
    });
    return { selected: final.selected, final, rounds: [final], examined: request.choices.length };
  }

  const rounds: PointResult<T>[] = [];
  const finalists: PointChoice<T>[] = [];
  for (let offset = 0; offset < request.choices.length; offset += batchSize) {
    const batch = request.choices.slice(offset, offset + batchSize);
    const none: PointChoice<T> = {
      id: `__none_${offset}`,
      label: 'None of this batch',
      description: 'No choice in this batch meaningfully answers the question.',
      kind: 'control',
    };
    const result = await kernel.point({
      goal: request.goal,
      context: `${request.context}\n\nThis is candidate batch ${Math.floor(offset / batchSize) + 1} of ${Math.ceil(request.choices.length / batchSize)}.`,
      question: `${request.question} Choose “None of this batch” when this batch is irrelevant.`,
      choices: [...batch, none],
      module: `${request.module}.shortlist`,
      ...(request.workflowId ? { trace: { workflowId: request.workflowId } } : {}),
    });
    rounds.push(result);
    if (result.selected.id !== none.id) finalists.push(result.selected);
  }

  if (finalists.length === 0) throw new Error('Jev rejected every candidate batch. The choice space needs better context or vocabulary.');
  if (finalists.length === 1) return { selected: finalists[0]!, final: rounds.at(-1) ?? null, rounds, examined: request.choices.length };
  const final = await kernel.point({
    goal: request.goal,
    context: `${request.context}\n\nThese are the winners of exhaustive Jev shortlist batches.`,
    question: request.question,
    choices: finalists,
    module: `${request.module}.final`,
    ...(request.workflowId ? { trace: { workflowId: request.workflowId } } : {}),
  });
  rounds.push(final);
  return { selected: final.selected, final, rounds, examined: request.choices.length };
}
