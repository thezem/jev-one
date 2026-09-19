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
  /** An independent world predicate. When supplied, Jev's STOP and a handler's
   * done flag cannot claim that the objective was achieved. */
  verifyCompletion?: (state: State) => boolean | Promise<boolean>;
  signal?: AbortSignal;
  onDecision?: (answer: VocabularyAnswer, state: State) => void | Promise<void>;
  onTurn?: (turn: SemanticTurn<State>) => void | Promise<void>;
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
  reason: 'semantic_answer' | 'capability_done' | 'jev_stop' | 'wait' | 'ask' | 'unknown' | 'max_turns' | 'no_progress' | 'verified' | 'aborted';
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
    const verified = () => options.verifyCompletion?.(structuredClone(state));
    const emit = async (item: SemanticTurn<State>) => {
      turns.push(item);
      await options.onTurn?.(structuredClone(item));
    };
    if (options.signal?.aborted) return { done: false, reason: 'aborted', answer: null, state, context, turns };
    if (await verified()) return { done: true, reason: 'verified', answer: null, state, context, turns };

    for (let turn = 1; turn <= maxTurns; turn += 1) {
      if (options.signal?.aborted) return { done: false, reason: 'aborted', answer: turns.at(-1)?.answer ?? null, state, context, turns };
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
      await options.onDecision?.(structuredClone(answer), structuredClone(state));
      // Cancellation during a model call or observer callback must not execute
      // the capability that the now-cancelled decision selected.
      if (options.signal?.aborted) return { done: false, reason: 'aborted', answer, state, context, turns };

      if (payload.type === 'meaning') {
        await emit({ turn, answer, stateBefore: before, stateAfter: structuredClone(state), observation: answer.entry.meaning });
        return { done: options.verifyCompletion ? !!(await verified()) : true, reason: 'semantic_answer', answer, state, context, turns };
      }
      if (payload.type === 'control') {
        const observation = `${answer.entry.label}: ${answer.entry.meaning}`;
        await emit({ turn, answer, stateBefore: before, stateAfter: structuredClone(state), observation });
        if (payload.action === 'continue') {
          context = `${context}\n\nTURN ${turn}: ${observation}`;
          repeated += 1;
          if (repeated >= maxRepeatedState) return { done: false, reason: 'no_progress', answer, state, context, turns };
          continue;
        }
        return { done: options.verifyCompletion ? !!(await verified()) : payload.action === 'stop', reason: payload.action === 'stop' ? 'jev_stop' : payload.action, answer, state, context, turns };
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
      await emit({ turn, answer, stateBefore: before, stateAfter: structuredClone(state), observation: result.observation, capability: capability.id });
      if (options.verifyCompletion ? await verified() : result.done) return { done: true, reason: options.verifyCompletion ? 'verified' : 'capability_done', answer, state, context, turns };
      if (repeated >= maxRepeatedState) return { done: false, reason: 'no_progress', answer, state, context, turns };
    }
    return { done: false, reason: 'max_turns', answer: turns.at(-1)?.answer ?? null, state, context, turns };
  }
}
