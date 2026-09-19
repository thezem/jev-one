import { randomUUID } from 'node:crypto';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface FeedbackInput { itemId: string; action: string; item?: JsonValue }
export interface FeedbackEvent extends FeedbackInput { id: string; at: string }
export interface ProfileState { version: 1; id: string; preferences: string; events: FeedbackEvent[] }

/** Reject lossy JSON conversions rather than silently dropping application data. */
export function jsonClone<T>(value: T): T {
  const ancestors = new Set<object>();
  const visit = (v: unknown): void => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (typeof v !== 'object' || v === null || ancestors.has(v)) throw new Error('Expected finite, acyclic JSON data.');
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw new Error('Expected plain JSON objects.');
    if (Array.isArray(v) && (Object.keys(v).length !== v.length || !Array.from({ length: v.length }, (_, index) => Object.hasOwn(v, index)).every(Boolean))) throw new Error('JSON arrays must be dense and have no extra properties.');
    ancestors.add(v);
    for (const item of Object.values(v)) visit(item);
    if (Object.getOwnPropertySymbols(v).length) throw new Error('JSON cannot contain symbol keys.');
    ancestors.delete(v);
  };
  visit(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
function feedback(input: FeedbackInput): FeedbackInput {
  if (!input || !nonempty(input.itemId) || !nonempty(input.action)) throw new Error('Feedback needs nonempty itemId and action.');
  return { itemId: input.itemId, action: input.action, ...(input.item !== undefined ? { item: jsonClone(input.item) } : {}) };
}

export class RecommendationProfile {
  #state: ProfileState;
  private constructor(state: ProfileState) { this.#state = state; }

  static create(options: { preferences?: string } = {}): RecommendationProfile {
    if (options.preferences !== undefined && typeof options.preferences !== 'string') throw new Error('Preferences must be text.');
    return new RecommendationProfile({ version: 1, id: randomUUID(), preferences: options.preferences ?? '', events: [] });
  }

  static restore(value: unknown): RecommendationProfile {
    const state = jsonClone(value) as ProfileState;
    if (!state || state.version !== 1 || !nonempty(state.id) || typeof state.preferences !== 'string' || !Array.isArray(state.events)) throw new Error('Invalid or unsupported profile state.');
    const ids = new Set<string>();
    const events = state.events.map(event => {
      if (!event || !nonempty(event.id) || ids.has(event.id) || typeof event.at !== 'string' || !Number.isFinite(Date.parse(event.at))) throw new Error('Invalid or duplicate feedback event.');
      ids.add(event.id);
      return { ...feedback(event), id: event.id, at: event.at };
    });
    return new RecommendationProfile({ version: 1, id: state.id, preferences: state.preferences, events });
  }

  record(input: FeedbackInput): FeedbackEvent {
    const event = { ...feedback(input), id: randomUUID(), at: new Date().toISOString() };
    this.#state.events.push(event);
    return jsonClone(event);
  }
  setPreferences(preferences: string): void {
    if (typeof preferences !== 'string') throw new Error('Preferences must be text.');
    this.#state.preferences = preferences;
  }
  /** Remove a mistaken event, then record its correction if needed. */
  forget(eventId: string): boolean {
    const index = this.#state.events.findIndex(event => event.id === eventId);
    if (index < 0) return false;
    this.#state.events.splice(index, 1);
    return true;
  }
  clearHistory(): void { this.#state.events = []; }
  export(): ProfileState { return jsonClone(this.#state); }
}

export class ProfileStore {
  create(options: { preferences?: string } = {}): RecommendationProfile { return RecommendationProfile.create(options); }
  restore(state: unknown): RecommendationProfile { return RecommendationProfile.restore(state); }
}
