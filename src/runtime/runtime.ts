import type { Effect } from '../types.js';
import type { VocabularyAnswer } from '../vocabulary/types.js';
import { VocabularyEngine } from '../vocabulary/engine.js';
import { RuntimeCapabilityRegistry, type CapabilityResult } from './capabilities.js';

export interface SemanticRuntimePolicy {
  maxTurns?: number;
  maxDepth?: number;
  maxRepeatedState?: number;
  allowedEffects?: Effect[];
  allowApprovalRequired?: boolean;
}

export interface SemanticRuntimeOptions<State = unknown> {
  goal: string;
  context: string;
  root: string | ((state: State, turn: number) => string);
  state: State;
  question?: string;
  policy?: SemanticRuntimePolicy;
}

export interface SemanticTurn<State = unknown> {
  turn: number;
  answer: VocabularyAnswer;
  stateBefore: State;
  stateAfter: State;
  observation: string;
  capability?: string;
}

export interface SemanticRun<State = unknown> {
  done: boolean;
  reason: 'semantic_answer' | 'capability_done' | 'jev_stop' | 'wait' | 'ask' | 'unknown' | 'max_turns' | 'no_progress';
  answer: VocabularyAnswer | null;
  state: State;
  context: string;
  turns: SemanticTurn<State>[];
}

const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

export class SemanticRuntime {
  readonly vocabulary: VocabularyEngine;
  readonly capabilities: RuntimeCapabilityRegistry;

  constructor(vocabulary: VocabularyEngine, capabilities = new RuntimeCapabilityRegistry()) {
    this.vocabulary = vocabulary;
    this.capabilities = capabilities;
  }

  async run<State>(options: SemanticRuntimeOptions<State>): Promise<SemanticRun<State>> {
    const maxTurns = options.policy?.maxTurns ?? 8;
    const maxRepeatedState = options.policy?.maxRepeatedState ?? 2;
    const allowed = new Set(options.policy?.allowedEffects ?? ['none', 'read', 'navigate']);
    let state = structuredClone(options.state);
    let context = options.context.trim();
    let repeated = 0;
    let previousState = stable(state);
    const turns: SemanticTurn<State>[] = [];

    for (let turn = 1; turn <= maxTurns; turn += 1) {
      const root = typeof options.root === 'function' ? options.root(structuredClone(state), turn) : options.root;
      const answer = await this.vocabulary.navigate({
        goal: options.goal,
        context: `${context}\n\nCURRENT STATE:\n${stable(state)}`,
        question: options.question ?? 'What meaning or legal move best advances the goal now?',
        root,
        maxDepth: options.policy?.maxDepth ?? 6,
      });
      const before = structuredClone(state);
      const payload = answer.entry.payload;

      if (payload.type === 'meaning') {
        turns.push({ turn, answer, stateBefore: before, stateAfter: structuredClone(state), observation: answer.entry.meaning });
        return { done: true, reason: 'semantic_answer', answer, state, context, turns };
      }
      if (payload.type === 'control') {
        const observation = `${answer.entry.label}: ${answer.entry.meaning}`;
        turns.push({ turn, answer, stateBefore: before, stateAfter: structuredClone(state), observation });
        if (payload.action === 'continue') { context = `${context}\n\nTURN ${turn}: ${observation}`; continue; }
        return { done: payload.action === 'stop', reason: payload.action === 'stop' ? 'jev_stop' : payload.action, answer, state, context, turns };
      }
      if (payload.type === 'vocabulary') throw new Error('Vocabulary navigation returned an unresolved vocabulary reference.');

      const capability = this.capabilities.get(payload.target);
      const requestedEffects = new Set([...(answer.entry.effects ?? []), ...capability.effects]);
      const forbidden = [...requestedEffects].filter((effect) => !allowed.has(effect));
      if (forbidden.length) throw new Error(`Capability "${capability.id}" requires forbidden effects: ${forbidden.join(', ')}.`);
      if (answer.entry.requiresApproval && !options.policy?.allowApprovalRequired) throw new Error(`Capability "${capability.id}" requires approval.`);

      const result = await capability.handler({ goal: options.goal, context, state, turn, entry: answer.entry }) as CapabilityResult<State>;
      state = structuredClone(result.state);
      const stateHash = stable(state);
      repeated = stateHash === previousState ? repeated + 1 : 0;
      previousState = stateHash;
      context = `${context}\n\n[OBSERVED TURN ${turn}]\nSelected: ${answer.entry.label}\nObservation: ${result.observation}`;
      turns.push({ turn, answer, stateBefore: before, stateAfter: structuredClone(state), observation: result.observation, capability: capability.id });
      if (result.done) return { done: true, reason: 'capability_done', answer, state, context, turns };
      if (repeated >= maxRepeatedState) return { done: false, reason: 'no_progress', answer, state, context, turns };
    }
    return { done: false, reason: 'max_turns', answer: turns.at(-1)?.answer ?? null, state, context, turns };
  }
}
