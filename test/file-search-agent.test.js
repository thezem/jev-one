import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JevOne, PointKernel } from '../dist/index.js';
import { JevFileSearchAgent } from '../dist/node/index.js';

const fixtureJev = (onPoint = () => {}) => new JevOne(new PointKernel({
  id: 'test-only-file-search-fixture',
  async point({ state, question, choices }) {
    onPoint({ state, question, choices });
    let selected;
    if (question.includes('What should happen')) {
      selected = question.includes('needle')
        ? choices.find(choice => choice.description.startsWith('COLLECT:'))
        : choices.find(choice => choice.description.startsWith('ENTER:'));
    } else if (question.includes('Which page')) {
      selected = choices.find(choice => choice.description.includes('needle'));
    } else {
      selected = choices.find(choice => choice.description.includes('needle')) ?? choices[0];
    }
    assert.ok(selected, `Fixture could not select from ${question}\n${state}`);
    return {
      selected: selected.id,
      probabilities: Object.fromEntries(choices.map(choice => [choice.id, choice.id === selected.id ? 1 : 0])),
    };
  },
}));

const scriptedJev = selections => {
  const remaining = [...selections];
  return new JevOne(new PointKernel({
    id: 'test-only-file-search-script',
    async point({ choices }) {
      const selected = remaining.shift();
      assert.ok(selected, 'Fixture ran out of selections.');
      assert.ok(choices.some(choice => choice.id === selected), `Selection ${selected} is not on this board.`);
      return { selected, probabilities: Object.fromEntries(choices.map(choice => [choice.id, choice.id === selected ? 1 : 0])) };
    },
  }));
};

test('file search agent navigates, backtracks, and collects multiple verified files', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-file-agent-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'alpha'));
  await mkdir(path.join(root, 'beta'));
  await writeFile(path.join(root, 'alpha', 'needle-one.txt'), 'one');
  await writeFile(path.join(root, 'beta', 'needle-two.txt'), 'two');

  const providerCalls = [];
  const jev = fixtureJev(point => providerCalls.push(point));
  const events = [];
  const result = await new JevFileSearchAgent(jev.numbers).search('Find both files whose names contain needle.', {
    roots: [root], maxResults: 2, maxDepth: 4, maxPoints: 20, onEvent: event => events.push(event),
  });

  assert.equal(result.done, true);
  assert.equal(result.reason, 'verified_results');
  assert.deepEqual(result.matches.map(match => path.basename(match.path)).sort(), ['needle-one.txt', 'needle-two.txt']);
  assert.ok(result.matches.every(match => /^\d{4}-\d{2}-\d{2}T/.test(match.modifiedAt)));
  assert.ok(result.matches.every(match => typeof match.sizeBytes === 'number' && match.sizeBytes > 0));
  assert.ok(result.matches.every(match => match.sizeLabel.includes('bytes')));
  assert.ok(providerCalls.some(call => call.state.includes('Current date and search start time (UTC):')));
  assert.ok(providerCalls.some(call => call.choices.some(choice => choice.description.includes('Last modified:'))));
  assert.ok(providerCalls.some(call => call.choices.some(choice => choice.description.includes('Size:'))));
  assert.ok(events.some(event => event.type === 'backtrack'));
  assert.equal(await readFile(path.join(root, 'alpha', 'needle-one.txt'), 'utf8'), 'one');
  assert.equal(await readFile(path.join(root, 'beta', 'needle-two.txt'), 'utf8'), 'two');
  assert.equal(jev.kernel.ledger.verify(), true);
});

test('file search agent selects a target through a paginated numbered board', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-file-agent-pages-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (let index = 1; index <= 30; index += 1) {
    const name = index === 29 ? 'needle-target' : `folder-${String(index).padStart(2, '0')}`;
    await mkdir(path.join(root, name));
  }

  const jev = fixtureJev();
  const stages = [];
  const result = await new JevFileSearchAgent(jev.numbers).search('Find the folder named needle-target.', {
    roots: [root], maxResults: 1, maxDepth: 2, maxPoints: 10,
    onEvent: event => { if (event.type === 'point') stages.push(event.stage); },
  });

  assert.equal(result.done, true);
  assert.equal(path.basename(result.matches[0].path), 'needle-target');
  assert.ok(stages.includes('page'));
  assert.ok(stages.includes('entry'));
  assert.ok(stages.includes('action'));
});

test('Jev can explicitly go back from a bad directory before exhausting it', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-file-agent-back-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'decoy'));
  await mkdir(path.join(root, 'target'));
  await writeFile(path.join(root, 'decoy', 'irrelevant.txt'), 'no');
  await writeFile(path.join(root, 'target', 'needle.txt'), 'yes');

  // decoy → ENTER → GO BACK → target → ENTER → needle → COLLECT
  const jev = scriptedJev(['1', '1', '2', '1', '1', '1', '1']);
  const events = [];
  const result = await new JevFileSearchAgent(jev.numbers).search('Find needle.txt.', {
    roots: [root], maxResults: 1, maxDepth: 4, maxPoints: 12, onEvent: event => events.push(event),
  });

  assert.equal(result.done, true);
  assert.equal(path.basename(result.matches[0].path), 'needle.txt');
  const back = events.find(event => event.type === 'backtrack' && path.basename(event.from) === 'decoy');
  assert.ok(back, 'Expected an explicit backtrack from the decoy directory.');
  assert.equal(events.some(event => event.type === 'skip' && event.path.endsWith('irrelevant.txt')), false);
});
