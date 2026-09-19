# Observable, verifiable world loops

`SemanticRuntime` can run a real Jev decision loop while a UI observes each
choice and its consequence. The application supplies the world, legal
capabilities, and an objective predicate. Jev chooses from the language that is
legal in the current state.

```js
const result = await jev.runtime.run({
  goal: 'Carry the notebook home.',
  context: observedMap,
  state: initialState,
  root(state) {
    // Register a vocabulary derived from actual available actions. Do not
    // select a phase from the turn number when Jev should choose the route.
    jev.vocabularies.register(vocabularyFor(state));
    return 'world';
  },
  policy: { maxTurns: 28, allowedEffects: ['none'], maxRepeatedState: 3 },
  verifyCompletion: state => state.notebookLocation === 'home',
  onDecision(answer, state) {
    // A choice has arrived; its capability has not executed yet.
    stream({ type: 'decision', answer, state });
  },
  onTurn(turn) {
    // The actual transition is now committed to the runtime's state.
    stream({ type: 'turn', ...turn });
  },
  signal: controller.signal,
});
```

The functions `vocabularyFor` and `stream` are application callbacks, not library
exports. Capability handlers remain registered through `jev.capabilities`.
The React lab's `server/living-world.js` is a working consumer, with maps,
numbered objects, expandable words, and a bounded in-memory world.

## Completion is a fact about the world

When `verifyCompletion` is supplied:

- It runs against a clone of the state before the first model call and after
  a capability changes state.
- `reason: 'verified', done: true` means the predicate returned true.
- A handler's `done: true` cannot override a false predicate.
- Jev choosing `STOP` ends the run with `reason: 'jev_stop'`; `done` remains
  false if the objective is not satisfied.
- Returning a semantic answer does not automatically satisfy the objective.

Without the predicate, existing completion semantics are preserved. Applications
that interpret `done` as verified goal achievement should supply the predicate.
Predicates should inspect facts rather than ask another model to certify success.

## Observation and cancellation

`onDecision` and `onTurn` may be asynchronous and are awaited. They receive
clones; modifying those arguments cannot change the runtime's actual state or
history. Observer errors propagate to the caller.

Cancellation is checked before each decision and again before executing its
capability. It does not interrupt an already-running provider call or undo an
already-executed capability. A cancelled run returns `reason: 'aborted'` and
retains committed turns. Provider calls remain bounded by the kernel deadline.

For a UI with atomic moves, use a one-turn run and retain the returned state and
observations in a session. Pause stops scheduling the next move while allowing
the current move to finish. Keep a session-wide move limit and no-progress
counter as well; a one-turn invocation cannot enforce limits across invocations.

## A word is not an implementation

A user-supplied word can bind to an existing allowed capability. Its meaning
participates in Jev's choice, and the handler determines the actual effect.
Adding a label alone cannot create a new tool or grant new permissions. New
capabilities can be registered independently of the vocabulary.

Selection weights and verified trace hashes describe recorded decisions. They
are not objective success evidence; the world predicate supplies that evidence.
