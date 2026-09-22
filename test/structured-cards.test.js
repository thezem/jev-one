import test from 'node:test';
import assert from 'node:assert/strict';
import { JevOne, PointKernel } from '../dist/index.js';

class CapturingJev {
  id = 'test-only-capturing-jev';
  request;
  async point(request) {
    this.request = request;
    return {
      selected: request.choices[0].id,
      probabilities: Object.fromEntries(request.choices.map((choice, index) => [choice.id, index === 0 ? 0.9 : 0.1])),
      model: 'typesafe-ai/jev-test-fixture',
    };
  }
}

test('decision cards preserve structured state, instructions, and criteria', async () => {
  const provider = new CapturingJev();
  const one = new JevOne(new PointKernel(provider));
  const answer = await one.cards.choose({
    context: { ticket: 'My parcel is late and tracking has not moved.', customer_tier: 'pro' },
    instructions: {
      question: 'Which team should handle this first?',
      focus: 'The customer main ask, not every topic mentioned.',
    },
    cards: [
      {
        id: 'shipping',
        label: 'Shipping',
        description: 'Delivery and tracking problems.',
        criteria: {
          what: ['tracking', 'delivery', 'missing packages'],
          not_for: 'Incorrect charges or refunds.',
          examples: ['Where is my order?', 'Tracking has not updated.'],
        },
        value: { team: 'shipping' },
      },
      {
        id: 'billing',
        label: 'Billing',
        criteria: { what: ['charges', 'refunds', 'invoices'] },
        value: { team: 'billing' },
      },
    ],
  });

  assert.equal(answer.id, 'shipping');
  assert.deepEqual(answer.card.value, { team: 'shipping' });
  assert.deepEqual(provider.request.state, {
    goal: 'Point to the decision card that best satisfies the instructions.',
    context: { ticket: 'My parcel is late and tracking has not moved.', customer_tier: 'pro' },
  });
  assert.deepEqual(provider.request.instructions, {
    question: 'Which team should handle this first?',
    focus: 'The customer main ask, not every topic mentioned.',
  });
  assert.deepEqual(provider.request.choices[0].criteria, {
    label: 'Shipping',
    description: 'Delivery and tracking problems.',
    criteria: {
      what: ['tracking', 'delivery', 'missing packages'],
      not_for: 'Incorrect charges or refunds.',
      examples: ['Where is my order?', 'Tracking has not updated.'],
    },
  });
});

test('number pointing optionally carries structured criteria without changing its API', async () => {
  const provider = new CapturingJev();
  const one = new JevOne(new PointKernel(provider));
  const answer = await one.numbers.choose({
    context: 'Choose a folder.',
    question: 'Which entry is most relevant?',
    items: [
      { label: 'src', description: 'Source folder.', criteria: { kind: 'directory', changed_files: 8 }, value: 'src' },
      { label: 'docs', description: 'Documentation folder.', criteria: { kind: 'directory', changed_files: 1 }, value: 'docs' },
    ],
  });
  assert.equal(answer.number, 1);
  assert.deepEqual(provider.request.choices[0].criteria, {
    label: 'src',
    description: 'Source folder.',
    criteria: { kind: 'directory', changed_files: 8 },
  });
});

test('legacy string points retain their original provider shape', async () => {
  const provider = new CapturingJev();
  const kernel = new PointKernel(provider);
  await kernel.point({
    goal: 'Choose one.',
    context: 'B fits.',
    question: 'Which?',
    module: 'legacy',
    choices: [
      { id: 'a', label: 'A', description: 'First.' },
      { id: 'b', label: 'B', description: 'Second.' },
    ],
  });
  assert.equal(provider.request.state, 'GOAL:\nChoose one.\n\nCONTEXT:\nB fits.');
  assert.equal(provider.request.question, 'Which?');
  assert.equal(provider.request.instructions, undefined);
  assert.equal(provider.request.choices[0].criteria, undefined);
});
