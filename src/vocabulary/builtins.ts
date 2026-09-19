import type { Vocabulary } from './types.js';

export const CONTROL_VOCABULARY: Vocabulary = {
  id: 'control', label: 'Control', description: 'Universal loop-control meanings.', entries: [
    { id: 'continue', label: 'CONTINUE', meaning: 'Continue from the newly observed state.', payload: { type: 'control', action: 'continue' } },
    { id: 'stop', label: 'STOP', meaning: 'End the loop and return the accumulated trace.', payload: { type: 'control', action: 'stop' } },
    { id: 'wait', label: 'WAIT', meaning: 'Pause until the world supplies another observation.', payload: { type: 'control', action: 'wait' } },
    { id: 'ask', label: 'ASK', meaning: 'Request missing information from the caller.', payload: { type: 'control', action: 'ask' } },
    { id: 'unknown', label: 'UNKNOWN', meaning: 'The available language cannot answer from current context.', payload: { type: 'control', action: 'unknown' } },
  ],
};
