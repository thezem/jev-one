#!/usr/bin/env node
import { JevOne, PointKernel } from '../dist/index.js';
import { VercelJevProvider } from '../dist/providers/gateway.js';
import { JevFileSearchAgent } from '../dist/node/index.js';
import { createInterface } from 'node:readline/promises';

const args = process.argv.slice(2);
const command = args.shift() ?? 'help';
const take = (name, fallback = '') => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value) throw new Error(`${name} requires a value.`);
  return value;
};
const takeAll = name => args.flatMap((value, index) => value === name && args[index + 1] ? [args[index + 1]] : []);
const has = name => args.includes(name);
const unquote = value => value.trim().replace(/^(['"])(.*)\1$/, '$2');

const help = () => console.log(`
JEV ONE 0.2 — one pointing intelligence

Usage:
  jev-one oracle --context "..." --question "..."
  jev-one will --goal "..." --context "..."
  jev-one capabilities
  jev-one find                    interactive file and folder search
  jev-one find --goal "..."       non-interactive search for scripts

Find options:
  --root PATH          filesystem root to search; repeat for several roots
  --max-results N      verified paths to collect (default: 1)
  --max-depth N        maximum depth within each root (default: 32)
  --max-points N       maximum Jev decisions (default: 120)

Environment:
  AI_GATEWAY_API_KEY   required for every Jev decision
`);

if (command === 'help' || command === '--help' || command === '-h') {
  help();
  process.exit(0);
}

const apiKey = process.env.AI_GATEWAY_API_KEY;
if (!apiKey) {
  console.error('JEV ONE requires AI_GATEWAY_API_KEY. There is no fallback provider.');
  process.exit(1);
}

const one = new JevOne(new PointKernel(new VercelJevProvider({ apiKey })));

if (command === 'capabilities') {
  console.log(JSON.stringify(one.registry.list(), null, 2));
} else if (command === 'oracle') {
  const context = take('--context');
  const question = take('--question');
  if (!context || !question) throw new Error('oracle requires --context and --question.');
  const answer = await one.oracle.ask(context, question);
  console.log(JSON.stringify({
    category: answer.category.label,
    answer: answer.word.label,
    meaning: answer.word.meaning,
    probability: answer.wordDecision?.probability ?? null,
    examinedWords: answer.examinedWords,
  }, null, 2));
} else if (command === 'will') {
  const goal = take('--goal');
  const context = take('--context');
  if (!goal || !context) throw new Error('will requires --goal and --context.');
  const decision = await one.orchestrator.run({
    goal, context, legalPostures:['talk','choose','act','wait','stop'], maxCycles:1,
    handlers: {
      talk: async () => ({done:true}), choose: async () => ({done:true}), act: async () => ({done:true}), wait: async () => ({done:true}),
    },
  });
  const will = decision.cycles[0]?.will;
  console.log(JSON.stringify(will ? {
    posture: will.selected.value,
    probability: will.probability,
    strength: will.strength,
    distribution: will.distribution,
  } : { posture:'stop', stoppedBy:decision.stoppedBy }, null, 2));
} else if (command === 'find') {
  let goal = take('--goal');
  let roots = takeAll('--root');
  let requestedResults = has('--max-results') ? take('--max-results') : '';
  let requestedDepth = has('--max-depth') ? take('--max-depth') : '';
  const interactive = !goal && process.stdin.isTTY;
  if (interactive) {
    const input = createInterface({ input: process.stdin, output: process.stderr });
    try {
      console.error('\nJEV FILE FINDER');
      console.error('Jev will navigate real folders, collect matching paths, and return here.\n');
      goal = (await input.question('What should Jev find?\n> ')).trim();
      if (!goal) throw new Error('A search request is required.');
      const location = (await input.question('\nWhere should it search? Leave blank for all detected disks.\nSeparate several paths with a semicolon.\n> ')).trim();
      roots = location ? location.split(';').map(unquote).filter(Boolean) : [];
      requestedResults = (await input.question('\nHow many results should it bring back? [1]\n> ')).trim() || '1';
      requestedDepth = (await input.question('\nMaximum directory depth? [32]\n> ')).trim() || '32';
      console.error(`\nSearching ${roots.length ? roots.join(', ') : 'all detected disks'} for ${requestedResults} result${requestedResults === '1' ? '' : 's'} up to depth ${requestedDepth}...\n`);
    } finally {
      input.close();
    }
  }
  if (!goal) throw new Error('find requires --goal when input is not interactive.');
  const integer = (name, fallback) => {
    const value = Number(take(name, String(fallback)));
    if (!Number.isInteger(value)) throw new Error(`${name} requires an integer.`);
    return value;
  };
  const agent = new JevFileSearchAgent(one.numbers);
  const run = await agent.search(goal, {
    ...(roots.length ? { roots } : {}),
    maxResults: requestedResults ? Number(requestedResults) : integer('--max-results', 1),
    maxDepth: requestedDepth ? Number(requestedDepth) : integer('--max-depth', 32),
    maxPoints: integer('--max-points', 120),
    onEvent(event) {
      if (event.type === 'enter') console.error(`→ enter ${event.path}`);
      if (event.type === 'inspect') console.error(`  inspect ${event.entries} entries`);
      if (event.type === 'point') console.error(`  Jev ${event.stage}: ${event.number} → ${event.label} (${Math.round(event.probability * 100)}%)`);
      if (event.type === 'collect') console.error(`✓ collect ${event.match.path}`);
      if (event.type === 'backtrack') console.error(`← backtrack ${event.to ?? 'to roots'}`);
      if (event.type === 'warning') console.error(`! ${event.path}: ${event.message}`);
    },
  });
  console.log(JSON.stringify(run, null, 2));
  if (!run.done) process.exitCode = 2;
} else {
  help();
  process.exitCode = 1;
}
