import test from 'node:test';
import assert from 'node:assert/strict';
import { JevOne, PointKernel } from '../dist/index.js';

function engine(actions = []) {
  const requests = [];
  const jev = new JevOne(new PointKernel({ id: 'test-only-recommendation', async point(request) {
    requests.push(request);
    const next = actions.shift();
    const selected = typeof next === 'function' ? next(request) : next;
    assert.ok(request.choices.some(choice => choice.id === selected), `Unavailable test selection: ${selected}`);
    return { selected, probabilities: Object.fromEntries(request.choices.map(choice => [choice.id, choice.id === selected ? 1 : 0])) };
  } }));
  return { jev, requests };
}
const item = id => ({ id, title: `Item ${id}`, topic: 'science' });

test('profile survives JSON save/restore, snapshots are detached, feedback can be corrected and forgotten', () => {
  const { jev } = engine();
  const profile = jev.profiles.create({ preferences: 'Science' });
  const snapshot = item('a');
  const recorded = profile.record({ itemId: 'a', action: 'liked', item: snapshot });
  snapshot.topic = 'changed'; recorded.action = 'changed';
  const saved = profile.export();
  const restored = jev.profiles.restore(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.export(), saved);
  saved.events[0].item.topic = 'changed';
  assert.equal(restored.export().events[0].item.topic, 'science');
  assert.equal(restored.export().events[0].action, 'liked');
  assert.equal(restored.forget(recorded.id), true);
  assert.equal(restored.forget(recorded.id), false);
  restored.record({ itemId: 'a', action: 'dismissed' });
  restored.setPreferences('Short science articles');
  restored.clearHistory();
  assert.equal(restored.export().events.length, 0);
  assert.equal(restored.export().preferences, 'Short science articles');
  assert.equal(profile.export().events.length, 1);
});

test('profile rejects unknown versions, duplicate event IDs, invalid dates and lossy JSON', () => {
  const { jev } = engine(); const profile = jev.profiles.create();
  profile.record({ itemId: 'a', action: 'liked' });
  const state = profile.export();
  assert.throws(() => jev.profiles.restore({ ...state, version: 2 }));
  assert.throws(() => jev.profiles.restore({ ...state, events: [state.events[0], state.events[0]] }));
  assert.throws(() => jev.profiles.restore({ ...state, events: [{ ...state.events[0], at: 'invalid' }] }));
  for (const bad of [NaN, Infinity, new Date(), { nested: undefined }, 1n, Array(2)]) assert.throws(() => profile.record({ itemId: 'a', action: 'liked', item: bad }));
});

test('recommendation uses restored feedback, exposes omitted history, and does not mutate profile', async () => {
  const { jev, requests } = engine(['item:0']);
  const profile = jev.profiles.create({ preferences: 'Science' });
  profile.record({ itemId: 'old', action: 'liked', item: item('old') });
  profile.record({ itemId: 'recent', action: 'dismissed' });
  const saved = profile.export();
  const result = await jev.recommend({ items: [item('a'), item('b')], context: 'Tonight', profile: jev.profiles.restore(saved), historyLimit: 1, maxItems: 1 });
  assert.match(requests[0].state, /recent/);
  assert.doesNotMatch(requests[0].state, /"itemId":"old"/);
  assert.equal(result.historyEventsUsed, 1); assert.equal(result.historyEventsOmitted, 1);
  assert.deepEqual(profile.export(), saved);
  assert.equal(result.items[0].id, 'a');
});

test('minimum hides finish; pages can be revisited and overlapping IDs cannot be selected twice', async () => {
  const { jev, requests } = engine(['next', 'item:0', 'item:0']);
  const fetched = [];
  const result = await jev.recommend({ context: 'Science', minItems: 3, maxItems: 3, pageSize: 2,
    source: ({ cursor, limit }) => { fetched.push([cursor, limit]); return cursor === null ? { items: [item('a'), item('b')], nextCursor: 'second' } : { items: [item('a'), item('c')] }; },
  });
  assert.deepEqual(result.items.map(x => x.id), ['c', 'a', 'b']);
  assert.equal(result.minimumMet, true); assert.equal(result.reason, 'max_items');
  assert.equal(result.pagesFetched, 2); assert.equal(fetched.length, 2);
  assert.ok(requests.every(request => !request.choices.some(choice => choice.id === 'finish')));
});

test('hard filters cannot be relaxed to meet minimum; insufficient catalog is explicit', async () => {
  const { jev } = engine();
  const result = await jev.recommend({ items: [item('a'), item('b')], context: '', minItems: 3, maxItems: 3, eligible: x => x.id === 'a' });
  assert.deepEqual(result.items.map(x => x.id), ['a']);
  assert.equal(result.minimumMet, false); assert.equal(result.reason, 'source_exhausted');
  assert.equal(result.decisions.length, 0); // Only one legal action: no fabricated model point.
});

test('without minimum Jev can finish with zero recommendations', async () => {
  const { jev } = engine(['finish']);
  const result = await jev.recommend({ items: [item('a')], context: '' });
  assert.equal(result.reason, 'finished'); assert.equal(result.items.length, 0);
});

test('page budget bounds even empty pages; decision budget bounds navigation loops', async () => {
  const empty = engine().jev;
  const limited = await empty.recommend({ context: '', minItems: 1, maxPages: 2, source: ({ cursor }) => ({ items: [], nextCursor: cursor === null ? '1' : '2' }) });
  assert.equal(limited.reason, 'max_pages'); assert.equal(limited.pagesFetched, 2);
  const { jev } = engine(['next', 'previous', 'next']);
  const result = await jev.recommend({ items: [item('a'), item('b')], pageSize: 1, context: '', minItems: 1, maxDecisions: 3 });
  assert.equal(result.reason, 'max_decisions'); assert.equal(result.decisions.length, 3);
  assert.equal(result.minimumMet, false);
});

test('cancellation before source access and during model decision prevents selection', async () => {
  const controller = new AbortController(); controller.abort();
  const { jev } = engine();
  const result = await jev.recommend({ context: '', signal: controller.signal, source: () => { throw new Error('must not fetch'); } });
  assert.equal(result.reason, 'aborted');
  const during = new AbortController();
  const live = engine([() => { during.abort(); return 'item:0'; }]).jev;
  const cancelled = await live.recommend({ items: [item('a'), item('b')], context: '', signal: during.signal, onSelection: () => { throw new Error('must not select'); } });
  assert.equal(cancelled.reason, 'aborted'); assert.equal(cancelled.items.length, 0);
});

test('eligibility is rechecked after model call and callbacks receive detached items', async () => {
  let allowed = true;
  const { jev } = engine([() => { allowed = false; return 'item:0'; }]);
  const result = await jev.recommend({ items: [item('a'), item('b')], context: '', minItems: 1, eligible: () => allowed });
  assert.equal(result.items.length, 0);
  const other = engine().jev;
  const picked = await other.recommend({ items: [item('a')], context: '', minItems: 1, maxItems: 1, onSelection: item => { item.id = 'mutated'; } });
  assert.equal(picked.items[0].id, 'a');
});

test('invalid options and source contracts fail explicitly', async () => {
  const { jev } = engine();
  for (const options of [{}, { items: [], source: () => ({ items: [] }) }, { items: [], minItems: 4, maxItems: 2 }, { items: [], pageSize: 0 }]) await assert.rejects(jev.recommend({ context: '', ...options }));
  await assert.rejects(jev.recommend({ context: '', pageSize: 1, source: () => ({ items: [item('a'), item('b')] }) }), /no larger/);
  await assert.rejects(jev.recommend({ context: '', minItems: 1, source: () => ({ items: [], nextCursor: 'same' }) }), /repeated/);
  await assert.rejects(jev.recommend({ context: '', items: [{ title: 'Missing ID' }] }), /describe/);
  await assert.rejects(jev.recommend({ context: '', source: () => { throw new Error('database offline'); } }), /database offline/);
});

test('finish becomes available at minimum; callback and provider failures propagate', async () => {
  const { jev } = engine(['item:0', 'finish']);
  const result = await jev.recommend({ items: [item('a'), item('b')], context: '', minItems: 1 });
  assert.equal(result.minimumMet, true); assert.equal(result.reason, 'finished'); assert.equal(result.items.length, 1);
  await assert.rejects(engine().jev.recommend({ items: [item('a')], context: '', minItems: 1, onSelection: () => { throw new Error('observer failed'); } }), /observer failed/);
  const failing = new JevOne(new PointKernel({ id: 'test-only-failure', async point() { throw new Error('provider offline'); } }));
  await assert.rejects(failing.recommend({ items: [item('a')], context: '' }), /provider offline/);
});
