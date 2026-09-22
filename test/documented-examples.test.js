import test from 'node:test';
import assert from 'node:assert/strict';
import { JevOne, PointKernel } from '../dist/index.js';
import { classifyMessage } from '../examples/quick-start.js';
import { deliverNotebook } from '../examples/observable-world.js';
import { routeTicket } from '../examples/structured-cards.js';

// Private test fixtures verify example wiring, not live Jev quality. These are
// not exported by the package and are never a runtime fallback.
function exampleEngine(selections) {
  const remaining = [...selections];
  return new JevOne(new PointKernel({ id: 'test-only-example-fixture', async point({ choices }) {
    const selected = remaining.shift();
    assert.ok(choices.some(choice => choice.id === selected), `Invalid fixture selection ${selected}`);
    return { selected, probabilities: Object.fromEntries(choices.map(choice => [choice.id, choice.id === selected ? 1 : 0])) };
  } }));
}
test('quick-start example uses the documented vocabulary response', async () => {
  const answer = await classifyMessage(exampleEngine(['bug']));
  assert.equal(answer.entry.label, 'BUG');
  assert.equal(answer.decision.probability, 1);
});
test('structured-card example returns the selected application value', async () => {
  const answer = await routeTicket(exampleEngine(['shipping']), 'Tracking has not updated.');
  assert.equal(answer.id, 'shipping');
  assert.deepEqual(answer.card.value, { team: 'shipping' });
});
for (const first of ['1', '2']) test(`documented courier can complete through route ${first}`, async () => {
  const jev = exampleEngine(['move', first, 'move', '2', 'pickup', 'move', first, 'move', '1', 'deliver']);
  const turns = [];
  const run = await deliverNotebook(jev, { onTurn: turn => turns.push(turn) });
  assert.equal(run.done, true);
  assert.equal(run.reason, 'verified');
  assert.equal(run.state.location, 'home');
  assert.equal(run.state.delivered, true);
  assert.equal(turns[0].stateAfter.location, first === '1' ? 'workshop' : 'garden');
  assert.equal(turns.length, 6);
  assert.equal(jev.kernel.ledger.verify(), true);
});
test('documented courier can stop without claiming delivery', async () => {
  const run = await deliverNotebook(exampleEngine(['stop']));
  assert.equal(run.done, false);
  assert.equal(run.reason, 'jev_stop');
  assert.equal(run.state.delivered, false);
});
