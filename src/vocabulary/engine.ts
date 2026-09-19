import { pointAcross } from '../hierarchical.js';
import type { PointKernel } from '../kernel.js';
import type { Vocabulary, VocabularyAnswer, VocabularyEntry } from './types.js';
import { VocabularyRegistry } from './registry.js';

export interface AnswerOptions {
  goal?: string;
  context: string;
  question: string;
  vocabulary: string | Vocabulary | VocabularyEntry[];
  label?: string;
  description?: string;
  batchSize?: number;
}

export interface NavigateVocabularyOptions extends Omit<AnswerOptions, 'vocabulary'> {
  root: string | Vocabulary;
  maxDepth?: number;
}

export class VocabularyEngine {
  readonly #kernel: PointKernel;
  readonly registry: VocabularyRegistry;

  constructor(kernel: PointKernel, registry = new VocabularyRegistry()) {
    this.#kernel = kernel;
    this.registry = registry;
  }

  #resolve(input: string | Vocabulary | VocabularyEntry[], label = 'Custom vocabulary', description = 'Vocabulary supplied by the calling program.'): Vocabulary {
    if (typeof input === 'string') return this.registry.get(input);
    if (Array.isArray(input)) return { id: 'inline', label, description, entries: input };
    return input;
  }

  async answer(options: AnswerOptions): Promise<VocabularyAnswer> {
    const vocabulary = this.#resolve(options.vocabulary, options.label, options.description);
    if (vocabulary.entries.length < 2) throw new Error(`Vocabulary "${vocabulary.id}" requires at least two entries.`);
    const pointed = await pointAcross(this.#kernel, {
      goal: options.goal ?? 'Return the most useful answer from the supplied vocabulary.',
      context: options.context,
      question: options.question,
      module: `vocabulary.${vocabulary.id}`,
      choices: vocabulary.entries.map((entry) => ({
        id: entry.id,
        label: entry.label,
        description: [entry.meaning, entry.tags?.length ? `Tags: ${entry.tags.join(', ')}.` : ''].filter(Boolean).join(' '),
        kind: entry.payload.type === 'capability' ? 'command' : entry.payload.type === 'control' ? 'control' : 'meaning',
        value: entry,
      })),
      ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
    });
    const decision = pointed.final ?? pointed.rounds.at(-1);
    if (!decision) throw new Error(`Vocabulary "${vocabulary.id}" did not produce a Jev decision.`);
    return {
      path: [vocabulary.id, pointed.selected.id],
      entry: pointed.selected.value!,
      decision,
      steps: [{ vocabulary: { id: vocabulary.id, label: vocabulary.label, description: vocabulary.description }, decision }],
    };
  }

  async navigate(options: NavigateVocabularyOptions): Promise<VocabularyAnswer> {
    const maxDepth = options.maxDepth ?? 6;
    let vocabulary = this.#resolve(options.root, options.label, options.description);
    const visited = new Set<string>();
    const steps: VocabularyAnswer['steps'] = [];
    const path: string[] = [];

    for (let depth = 0; depth < maxDepth; depth += 1) {
      if (visited.has(vocabulary.id)) throw new Error(`Vocabulary cycle detected at "${vocabulary.id}".`);
      visited.add(vocabulary.id);
      const answer = await this.answer({
        ...(options.goal !== undefined ? { goal: options.goal } : {}),
        context: `${options.context}\n\nVocabulary path: ${path.join(' → ') || 'root'}\nCurrent territory: ${vocabulary.label} — ${vocabulary.description}`,
        question: options.question,
        vocabulary,
        ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
      });
      steps.push(answer.steps[0]!);
      path.push(vocabulary.id, answer.entry.id);
      if (answer.entry.payload.type !== 'vocabulary') return { ...answer, path, steps };
      vocabulary = this.registry.get(answer.entry.payload.target);
    }
    throw new Error(`Vocabulary navigation exceeded maxDepth ${maxDepth}.`);
  }
}
