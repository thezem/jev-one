import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverMismatchedChoice } from '../dist/providers/gateway.js';

test('gateway recovers a valid Jev distribution whose selected ID is not the argmax', () => {
  const error = new Error('Question "selection" did not select a highest-probability option.');
  error.data = {
    selection: {
      type: 'choice',
      choice: '1',
      probabilities: { '1': 0.18, '2': 0.02, '8': 0.19 },
    },
  };
  assert.deepEqual(recoverMismatchedChoice(error), {
    selected: '8',
    probabilities: { '1': 0.18, '2': 0.02, '8': 0.19 },
    usage: { recoveredChoiceMismatch: 1 },
  });
});

test('gateway does not conceal unrelated invalid responses', () => {
  const error = new Error('Provider unavailable.');
  assert.equal(recoverMismatchedChoice(error), null);
});
