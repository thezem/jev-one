# Jev One

**Give Jev a language. Let it point. Keep the program in control.**

Jev One is an experimental TypeScript runtime for building applications around
[TypeSafe AI Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev),
a model that answers by selecting from choices you provide.

Instead of asking a generative model to invent the next action, Jev One lets a
program define the complete legal world—meanings, routes, capabilities, control
signals, files, browser elements, game moves, or any other bounded set. Jev
points to the best fit. Deterministic code validates the selection, changes the
state, observes the result, and decides whether another turn is allowed.

```text
goal + context + question + legal choices
                       │
                       ▼
                 Jev points
                       │
                       ▼
     policy validates → program acts → state changes
                       │
                       └─────────────── repeat, wait, or stop
```

> [!IMPORTANT]
> Jev One uses the real Jev model through Vercel AI Gateway. It has no heuristic,
> offline, or general-LLM fallback.

## Why this exists

Jev is unusually fast and useful when the answer already exists in a bounded
choice space. The hard part is not making one classification call. It is turning
that primitive into a reliable program that can:

- speak in domain-specific vocabularies;
- descend through large or hierarchical choice spaces;
- point at a changing list without rebuilding its language;
- carry state and observations across multiple turns;
- expose only legal actions at each step;
- stop on completion, uncertainty, repetition, or budget exhaustion;
- leave a trace of every decision.

Jev One packages those mechanics as a small runtime.

## What you can build

- **Semantic interfaces** that classify situations using your words and meanings.
- **Decision gates** that choose, score, or answer Boolean questions.
- **Navigators** for folders, links, nodes, browser elements, or game moves.
- **Tool routers** that point to registered capabilities with explicit effects.
- **State machines** whose observations change the legal vocabulary each turn.
- **Agent judges** for plans, diffs, candidate actions, and completion checks.

## Installation

Jev One currently ships from source and requires Node.js 20 or newer.

```bash
git clone https://github.com/thezem/jev-one.git
cd jev-one
npm install
npm run build
```

Set a Vercel AI Gateway key in your environment:

```powershell
$env:AI_GATEWAY_API_KEY = "your-key"
```

Never place the key in source code or commit it to the repository.

## Quick start

```js
import { JevOne, PointKernel } from 'jev-one'
import { VercelJevProvider } from 'jev-one/gateway'

const jev = new JevOne(
  new PointKernel(
    new VercelJevProvider({ apiKey: process.env.AI_GATEWAY_API_KEY }),
  ),
)

jev.vocabularies.register({
  id: 'next-move',
  label: 'Next move',
  description: 'Small actions that can change the current situation.',
  entries: [
    {
      id: 'make-it-tiny',
      label: 'MAKE IT TINY',
      meaning: 'Choose one action small enough to begin without negotiation.',
      payload: { type: 'meaning' },
    },
    {
      id: 'change-the-scene',
      label: 'CHANGE THE SCENE',
      meaning: 'Shift location or posture to interrupt the current pattern.',
      payload: { type: 'meaning' },
    },
    {
      id: 'reach-out',
      label: 'REACH OUT',
      meaning: 'Make light contact without demanding a large conversation.',
      payload: { type: 'meaning' },
    },
  ],
})

const answer = await jev.vocabulary.answer({
  context: 'I have several unfinished tasks and keep switching between them.',
  question: 'What response best fits this moment?',
  vocabulary: 'next-move',
})

console.log(answer.entry.label)
console.log(answer.entry.meaning)
console.log(answer.decision.probability)
```

Jev can only select one of the registered entries. It cannot invent a fourth.

## The vocabulary model

A vocabulary is a named collection of entries. Every entry resolves to exactly
one payload type:

| Payload | Meaning |
| --- | --- |
| `meaning` | Return a semantic answer to the caller. |
| `vocabulary` | Continue into another vocabulary. |
| `capability` | Invoke a registered, policy-checked program function. |
| `control` | Continue, stop, wait, ask, or report unknown. |

Vocabulary references make large languages navigable:

```js
jev.vocabularies.register({
  id: 'world',
  label: 'World',
  description: 'The available semantic territories.',
  entries: [
    {
      id: 'emotion',
      label: 'EMOTION',
      meaning: 'Interpret the situation emotionally.',
      payload: { type: 'vocabulary', target: 'emotions' },
    },
    {
      id: 'action',
      label: 'ACTION',
      meaning: 'Choose a legal next action.',
      payload: { type: 'vocabulary', target: 'actions' },
    },
  ],
})

const answer = await jev.vocabulary.navigate({
  root: 'world',
  context,
  question: 'Where should this situation be interpreted?',
  maxDepth: 6,
})
```

The engine follows Jev-selected vocabulary references until it reaches a leaf.
Cycles and excessive depth are rejected deterministically.

## The permanent 1–25 board

Dynamic environments should not generate a new vocabulary for every screen or
directory. Jev One includes a permanent numeric language—`1` through `25`—that
can be temporarily bound to the items visible right now.

```js
const pointed = await jev.numbers.choose({
  context: 'We are in the animals directory and need to find a feline.',
  question: 'Which current entry should be opened?',
  items: currentEntries.slice(0, 25).map((entry) => ({
    label: entry.name,
    description: entry.kind,
    value: entry,
  })),
})

console.log(pointed.number)     // 3
console.log(pointed.item.value) // the item currently bound to 3
```

This is the universal adapter for filesystem entries, DOM elements, commands,
search results, game moves, tools, or any changing legal list.

## Stateful semantic loops

The semantic runtime turns pointing into a bounded loop:

```text
observe state → expose a vocabulary → Jev points → validate effects
      ▲                                               │
      └──────── update context and state ◀────────────┘
```

Register a capability:

```js
jev.capabilities.register({
  id: 'map.inspect',
  description: 'Inspect the current map location.',
  effects: ['read'],
  handler: ({ state }) => ({
    state: { ...state, inspected: true },
    observation: `Inspected ${state.location}.`,
  }),
})
```

Then run it with explicit limits:

```js
const run = await jev.runtime.run({
  goal: 'Find and verify the destination.',
  context: 'Begin at the entrance.',
  root: (state) => state.inspected ? 'routes' : 'observation-actions',
  state: { location: 'entrance', inspected: false },
  policy: {
    maxTurns: 8,
    maxDepth: 6,
    maxRepeatedState: 2,
    allowedEffects: ['read', 'navigate'],
  },
})
```

The caller owns the state, capabilities, allowed effects, and stopping policy.
Jev owns only the semantic selection.

## Focused modules

The vocabulary runtime is the general foundation. Jev One also exposes focused
surfaces for common patterns:

| Module | Purpose |
| --- | --- |
| `oracle` | Point into an expandable hierarchical lexicon of meanings. |
| `cortex` | Make direct choices, Boolean judgments, scores, and cumulative decisions. |
| `navigator` | Repeatedly choose among legal transitions exposed by an environment. |
| `commander` | Build an inert `family → operation → target` proposal. Never executes it. |
| `voice` | Select speech acts and facts, then render deterministic templates. |
| `orchestrator` | Choose among currently legal postures: talk, choose, act, wait, stop. |

### Cumulative decisions with Cortex

```js
const plan = await jev.cortex.sequence(
  'Choose an implementation direction.',
  'The feature must work locally and remain easy to inspect.',
  [
    {
      id: 'storage',
      question: 'Which storage model best fits?',
      choices: storageChoices,
    },
    {
      id: 'interface',
      question: 'Which interface should expose it?',
      choices: interfaceChoices,
    },
  ],
)
```

Every selected answer is appended to the context before the next question.

### Read-only filesystem navigation

```js
import { ReadonlyFilesystemEnvironment } from 'jev-one/node'

const filesystem = await ReadonlyFilesystemEnvironment.create({
  root: 'G:\\',
  maxDepth: 4,
})

const run = await jev.navigator.run(
  'Find the Jev laboratory.',
  filesystem.initialState(),
  filesystem,
  { maxDepth: 4 },
)
```

The included adapter performs read-only observation, rejects paths outside its
root, ignores symbolic links, and clamps traversal depth to four.

## CLI

After building, the CLI can call the same runtime:

```bash
jev-one oracle --context "..." --question "..."
jev-one will --goal "..." --context "..."
jev-one capabilities
```

Decision commands refuse to run without `AI_GATEWAY_API_KEY`.

## Safety boundaries

Jev One deliberately separates **semantic judgment** from **authority**:

1. Jev can point only to choices supplied by the application.
2. The kernel validates IDs, choice counts, deadlines, and distributions.
3. Capabilities must be registered before Jev can select them.
4. Effects are declared and checked against runtime policy.
5. Approval-required entries are rejected unless explicitly enabled.
6. The runtime stops on excessive turns, depth, cycles, or repeated state.
7. Commander creates dry-run proposals and contains no executor.
8. The included filesystem environment cannot write, delete, or escape its root.
9. Every kernel decision enters a SHA-256 hash-chained trace ledger.

Applications remain responsible for authentication, permissions, side effects,
post-action verification, and recovery.

## Package map

```text
jev-one
├── PointKernel               validated Jev calls and trace recording
├── VocabularyRegistry        installed domain languages
├── VocabularyEngine          direct and hierarchical pointing
├── IndexedVocabulary         permanent 1–25 dynamic board
├── SemanticRuntime           state, observation, capability, and stop loop
├── RuntimeCapabilityRegistry effect-labelled program functions
├── Oracle / Cortex           semantic and planning helpers
├── Navigator / Commander     traversal and inert action proposals
├── Voice / Orchestrator      deterministic expression and posture loops
└── TraceLedger               append-only hash-chained decision history
```

For the design rationale and internal contracts, see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Development

```bash
npm install
npm run build
npm test
npm run demo
```

`npm test` compiles the package and runs the Node test suite. The demo performs
real model calls and therefore requires `AI_GATEWAY_API_KEY`.

## Status

Jev One is an experimental research project. Its concepts and safety boundaries
are intentional, but the API may evolve while real applications test the model.

## License

[MIT](LICENSE)
