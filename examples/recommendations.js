import { JevOne, PointKernel } from 'jev-one';
import { VercelJevProvider } from 'jev-one/gateway';

const apiKey = process.env.AI_GATEWAY_API_KEY;
if (!apiKey) throw new Error('Set AI_GATEWAY_API_KEY before running this example.');
const jev = new JevOne(new PointKernel(new VercelJevProvider({ apiKey })));

const profile = jev.profiles.create({ preferences: 'Short practical science activities. Prefer hands-on experiments over reading.' });
profile.record({ itemId: 'paper-bridge', action: 'liked', item: { title: 'Build a paper bridge', topic: 'engineering', minutes: 15 } });
profile.record({ itemId: 'long-lecture', action: 'dismissed', item: { title: 'Two-hour astronomy lecture', minutes: 120 } });

// This string could be a database JSON field, a file, or an API response.
const saved = JSON.stringify(profile.export());
const restored = jev.profiles.restore(JSON.parse(saved));
const catalog = [
  { id: 'book', title: 'Read a science encyclopedia', minutes: 90 },
  { id: 'clouds', title: 'Read a guide to cloud types', minutes: 15 },
  { id: 'lecture', title: 'Watch an introductory chemistry lecture', minutes: 20 },
  { id: 'tower', title: 'Build a paper tower and test its strength', minutes: 15 },
  { id: 'compass', title: 'Make a floating compass with a magnetized needle', minutes: 20 },
  { id: 'shadows', title: 'Measure shadows outside to estimate a tree height', minutes: 15 },
];
const result = await jev.recommend({
  profile: restored,
  context: 'Choose two activities for an adult with 20 minutes per activity and basic household materials.',
  eligible: item => item.minutes <= 20,
  pageSize: 2, minItems: 2, maxItems: 2, maxPages: 3, maxDecisions: 12,
  source({ cursor, limit }) {
    const start = cursor === null ? 0 : Number(cursor);
    console.log(`Loaded catalog page at offset ${start}.`);
    return { items: catalog.slice(start, start + limit), nextCursor: start + limit < catalog.length ? String(start + limit) : null };
  },
  onSelection: item => console.log(`Recommended: ${item.title}`),
});
console.log(JSON.stringify({ items: result.items, minimumMet: result.minimumMet, reason: result.reason, pagesFetched: result.pagesFetched, decisions: result.decisions.length, restoredFeedback: restored.export().events.length, traceValid: jev.kernel.ledger.verify() }, null, 2));
if (!result.minimumMet) process.exitCode = 2;
