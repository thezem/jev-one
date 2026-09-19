import { createHash, randomUUID } from 'node:crypto';
import type { TraceEvent } from './types.js';

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export class TraceLedger {
  readonly #events: TraceEvent[] = [];

  append(input: Omit<TraceEvent, 'id' | 'at' | 'previousHash' | 'hash'>): TraceEvent {
    const previousHash = this.#events.at(-1)?.hash ?? 'GENESIS';
    const base = { ...input, id: randomUUID(), at: new Date().toISOString(), previousHash };
    const hash = createHash('sha256').update(stableJson(base)).digest('hex');
    const event: TraceEvent = { ...base, hash };
    this.#events.push(event);
    return structuredClone(event);
  }

  all(workflowId?: string): TraceEvent[] {
    const events = workflowId ? this.#events.filter((event) => event.workflowId === workflowId) : this.#events;
    return structuredClone(events);
  }

  verify(): boolean {
    let previousHash = 'GENESIS';
    return this.#events.every((event) => {
      const { hash, ...base } = event;
      const valid = event.previousHash === previousHash && createHash('sha256').update(stableJson(base)).digest('hex') === hash;
      previousHash = hash;
      return valid;
    });
  }
}
