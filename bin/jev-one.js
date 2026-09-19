#!/usr/bin/env node
import { JevOne, PointKernel } from '../dist/index.js';
import { VercelJevProvider } from '../dist/providers/gateway.js';

const args = process.argv.slice(2);
const command = args.shift() ?? 'help';
const take = (name, fallback = '') => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value) throw new Error(`${name} requires a value.`);
  return value;
};

const help = () => console.log(`
JEV ONE 0.1 — one pointing intelligence

Usage:
  jev-one oracle --context "..." --question "..."
  jev-one will --goal "..." --context "..."
  jev-one capabilities

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
} else {
  help();
  process.exitCode = 1;
}
