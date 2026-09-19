# Integrating Jev One: a guide for coding agents

Read the [README](../README.md) for the product model. Use this document as the
implementation contract. Verify behavior against the source and tests when the
installed version differs from this checkout.

## The job

Build a program in which Jev chooses from a supplied language and those choices
have defined consequences. The application owns legal actions, observations,
permissions, effects, and objective verification. Real Jev supplies the semantic
selections. Do not introduce a heuristic, scripted, or general-LLM fallback as a
working product mode. Private fixtures belong in tests only.

For stateful work, begin with the complete
[courier example](../examples/observable-world.js). It uses the actual library
and has tests for both routes and premature stopping.

## Exact entry points

```js
import { JevOne, PointKernel } from 'jev-one';
import { VercelJevProvider } from 'jev-one/gateway';
import { loadVocabularyDirectory, ReadonlyFilesystemEnvironment } from 'jev-one/node';
```

The Gateway adapter and Node helpers run server-side. Initialize the provider
using `process.env.AI_GATEWAY_API_KEY`; never inspect or log the value. Rebuild
with `npm run build` after modifying TypeScript source, because package imports
resolve to `dist`.

| Task | API | Important returned fields |
| --- | --- | --- |
| One semantic answer | `jev.vocabulary.answer({ context, question, vocabulary, goal? })` | `entry`, `decision`, `path`, `steps` |
| Hierarchical answer | `jev.vocabulary.navigate({ context, question, root, goal?, maxDepth? })` | The same shape; `steps` records vocabulary decisions |
| Bind current objects to numbers | `jev.numbers.choose({ context, question, items, goal? })` | `number`, `index`, `item`, `decision` |
| Add or replace vocabulary | `jev.vocabularies.register(vocabulary)` | Registry |
| Register several vocabularies | `jev.vocabularies.registerMany(vocabularies)` | Registry |
| Add an effect handler | `jev.capabilities.register(capability)` | Capability registry |
| Run the semantic loop | `jev.runtime.run(options)` | `done`, `reason`, `state`, `context`, `answer`, `turns` |
| Inspect recorded model points | `jev.kernel.ledger.all()` | Hash-chained events |
| Check local chain integrity | `jev.kernel.ledger.verify()` | Boolean; not a correctness judgment |

These are the exported method names. Do not invent convenience calls such as
`jev.answerFrom`, `jev.run`, `jev.navigateIndex`, or `jev.addWord`.

## Build an integration in this order

1. **Define an observable goal.** Write the predicate that establishes success
   before creating the demo or UI. For subjective output, return a semantic
   answer and say what it represents; avoid fabricated completion percentages.
2. **Define the state.** Use plain JSON-compatible objects. Include relevant
   inventory, location, constraints, and results. Keep presentation counters
   outside the state used to detect no-progress.
3. **Implement actual transitions.** Each capability validates its prerequisites,
   applies a permitted effect, and reports the observed result. Revalidate live
   external state if it may have changed while Jev was deciding.
4. **Expose current affordances.** Register vocabulary entries only for actions
   that are legal now. A state-dependent `root(state, turn)` may rebuild the
   vocabulary and return its ID. The callback is synchronous.
5. **Give Jev enough context.** Include the objective, relevant environment,
   current inventory, object destinations, and recent observations. An ID alone
   usually does not explain an option's consequence.
6. **Connect the runtime.** Supply policy limits and `verifyCompletion`. Wire
   `onDecision` and `onTurn` to the UI or terminal. Stream a result when it occurs;
   label any later replay as replay.
7. **Verify alternatives and failure.** Change the goal, remove a capability,
   change a route, and exercise a stop before completion. The output should
   reflect the actual state, including incomplete outcomes.

The minimum useful demonstration has a visible starting state, a real choice,
an actual consequence, and a next decision that sees that consequence.

## Vocabulary and capability contracts

A registered vocabulary needs `id`, `label`, `description`, and at least two
`entries`. Each entry needs a unique nonempty `id`, `label`, `meaning`, and
`payload`.

```js
const entry = {
  id: 'plant',
  label: 'NURTURE',
  meaning: 'Plant the carried seeds in the empty greenhouse planter.',
  payload: { type: 'capability', target: 'garden.plant' },
  effects: ['none'], // only in-memory simulated changes in this example
};

jev.capabilities.register({
  id: 'garden.plant',
  description: 'Plant seeds in the simulated greenhouse.',
  effects: ['none'],
  handler({ state }) {
    if (state.location !== 'greenhouse' || state.cargo !== 'seeds') {
      throw new Error('Planting requires seeds at the greenhouse.');
    }
    return {
      state: { ...state, cargo: null, planted: true },
      observation: 'Seeds are planted. The carrying slot is empty.',
    };
  },
});
```

Register `entry` alongside another legal alternative before running. A handler
receives `{ goal, context, state, turn, entry }`. Capability payloads may have an
`input` object; access it through `entry.payload.input` and validate it yourself.
It is not a generated argument list or automatic positional invocation.

Allowed effect names are `none`, `read`, `navigate`, `write`, `copy`, `rename`,
`delete`, `execute`, and `network`. Runtime defaults allow `none`, `read`, and
`navigate`. The entry's and capability's declarations are combined for the check.
These declarations are not a sandbox around the handler.

`requiresApproval: true` on an entry is rejected unless
`policy.allowApprovalRequired` is enabled. That flag does not collect approval;
your application must enforce its own approval and authorization process.

New words can bind to existing handlers. New behavior requires an implemented
handler. Vocabulary meaning does not execute code, grant permissions, or train
the underlying model.

## Load a directory of vocabularies

Create `vocab/emotions.json`:

```json
{
  "id": "emotions",
  "label": "Emotions",
  "description": "Qualities expressed in a piece of writing.",
  "entries": [
    { "id": "curious", "label": "CURIOUS", "meaning": "Interested in discovering something.", "payload": { "type": "meaning" } },
    { "id": "uncertain", "label": "UNCERTAIN", "meaning": "Unsure which interpretation fits.", "payload": { "type": "meaning" } }
  ]
}
```

Then, using the initialized `jev` instance:

```js
const vocabularies = await loadVocabularyDirectory('./vocab', { maxDepth: 6 });
jev.vocabularies.registerMany(vocabularies);
const answer = await jev.vocabulary.answer({
  vocabulary: 'emotions',
  context: 'I keep wondering what would happen if we tried another approach.',
  question: 'Which quality is expressed here?',
});
```

Each `.json` file contains one vocabulary object. The loader walks subdirectories
and validates vocabulary structure; it does not invent routing entries from
directory names. Hierarchy is explicit in `payload: { type: 'vocabulary', target:
'another-vocabulary-id' }`. Keep vocabulary IDs distinct: registering an existing
ID replaces it. Validate untrusted input at your application boundary.

## Choose the correct return semantics

- `vocabulary.answer` returns the selected entry, including an unresolved
  vocabulary or capability payload. It does not execute a capability.
- `vocabulary.navigate` follows vocabulary references and returns a leaf.
  It still does not execute the leaf's capability.
- `runtime.run` interprets the leaf, validates effects, invokes capability
  handlers, and repeats as needed.
- `meaning` returns immediately. To accumulate a selection and continue, bind
  it to a handler that updates state instead.
- `wait`, `ask`, and `unknown` return to the caller. The library does not
  automatically poll, contact a user, or schedule a later run.
- `STOP` means a requested stop. For objective success, always supply
  `verifyCompletion` and inspect `done` plus `reason`.

Defaults: `maxTurns: 8`, `maxDepth: 6`, `maxRepeatedState: 2`. The kernel defaults
to 50 choices and a 30-second per-call deadline. The indexed board requires 2–25
items. A runtime turn may include several model calls, especially when a handler
or vocabulary hierarchy makes additional selections.

The no-progress check compares consecutive serialized states, not arbitrary
cycles or semantic equivalence. The turn budget remains necessary. For one-turn
server sessions, enforce limits across requests and serialize concurrent steps.

## Stream, pause, and recover

`onDecision(answer, state)` runs after vocabulary selection and before the
capability. `onTurn(turn)` runs after the transition. Both are awaited and receive
clones. Nested points inside handlers need their own application event if you
want to display them immediately.

An `AbortSignal` is checked at runtime boundaries and after `onDecision`, before
executing the capability. It does not abort an already-running model call or
undo a committed effect. A friendly pause can finish the current atomic move
and stop scheduling the next one.

Observer and handler failures propagate. In particular, an `onTurn` failure can
occur after an external effect has already happened. Use authoritative state,
idempotency, or reconciliation before retrying real-world operations. See
[OBSERVABLE-RUNTIME.md](OBSERVABLE-RUNTIME.md) for lifecycle details.

## Integration acceptance checks

- A different model-selected neighbor produces a different destination.
- A removed or illegal action cannot execute.
- The next decision receives the new state and relevant observation.
- A taught label invokes its bound effect, rather than merely changing a display.
- A premature stop cannot pass the objective predicate.
- Failure, no-progress, cancellation, and exhausted budgets remain distinct from success.
- Network tests use actual Jev; mechanics tests may use private fixtures and say so.
- Keys stay server-side. Logs, traces, fixtures, and Git contain no credentials.
- The UI shows a concrete goal and world. Internal prompt fields appear only
  when useful to the person operating it.

Run `npm test` and `npm run build` before shipping source changes. Run the live
examples when an authorized Gateway environment is available. Tests alone do
not establish how Jev behaves on your domain.

## Source map

| Contract | Source |
| --- | --- |
| Choice/provider types and effects | [`src/types.ts`](../src/types.ts) |
| Kernel validation, deadlines, and diagnostics | [`src/kernel.ts`](../src/kernel.ts) |
| Vocabulary entries and payloads | [`src/vocabulary/types.ts`](../src/vocabulary/types.ts) |
| Direct and hierarchical vocabulary selection | [`src/vocabulary/engine.ts`](../src/vocabulary/engine.ts) |
| Numbered boards | [`src/vocabulary/indexed.ts`](../src/vocabulary/indexed.ts) |
| Capability handlers | [`src/runtime/capabilities.ts`](../src/runtime/capabilities.ts) |
| Semantic loop and completion | [`src/runtime/runtime.ts`](../src/runtime/runtime.ts) |
| Completion, cancellation, and observer tests | [`test/runtime-lifecycle.test.js`](../test/runtime-lifecycle.test.js) |
| Executable example wiring tests | [`test/documented-examples.test.js`](../test/documented-examples.test.js) |
