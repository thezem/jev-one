import type { Effect } from '../types.js';
import type { VocabularyEntry } from '../vocabulary/types.js';

export interface CapabilityContext<State = unknown> {
  goal: string;
  context: string;
  state: State;
  turn: number;
  entry: VocabularyEntry;
}

export interface CapabilityResult<State = unknown> {
  observation: string;
  state: State;
  done?: boolean;
  data?: unknown;
}

export interface RuntimeCapability<State = unknown> {
  id: string;
  description: string;
  effects: Effect[];
  handler(context: CapabilityContext<State>): Promise<CapabilityResult<State>> | CapabilityResult<State>;
}

export class RuntimeCapabilityRegistry {
  readonly #items = new Map<string, RuntimeCapability>();
  register(capability: RuntimeCapability): this {
    if (!capability.id.trim()) throw new Error('Capability requires a non-empty id.');
    this.#items.set(capability.id, capability);
    return this;
  }
  get(id: string): RuntimeCapability {
    const capability = this.#items.get(id);
    if (!capability) throw new Error(`Unknown capability: ${id}`);
    return capability;
  }
  list(): Array<Pick<RuntimeCapability, 'id' | 'description' | 'effects'>> {
    return [...this.#items.values()].map(({ id, description, effects }) => ({ id, description, effects: [...effects] }));
  }
}
