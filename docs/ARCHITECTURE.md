# JEV ONE architecture

JEV ONE is a TypeScript-authored, ESM-first JavaScript library built around one mandatory dependency: the real TypeSafe AI Jev model.

## One primitive

Every semantic operation reduces to:

```text
goal + context + question + bounded choices → Jev points
```

The kernel validates the choice surface, invokes Jev, normalizes the distribution, derives uncertainty diagnostics, and appends the decision to a hash-chained trace.

## Vocabulary runtime

Programs teach Jev what it can say by registering typed vocabularies. Every
entry resolves to exactly one payload:

```text
meaning | vocabulary reference | capability | control
```

Vocabulary references form a recursive tree. The engine follows Jev-selected
references until it reaches a leaf, with deterministic cycle and depth limits.
The same engine accepts built-in packs, inline entries, or recursively loaded
JSON directories.

For arbitrary observed lists, `IndexedVocabulary` exposes a permanent 1–25
language. A program temporarily binds those positions to the current files,
DOM elements, commands, search results, or legal moves. The vocabulary stays
constant while the board changes.

## Semantic loop

`SemanticRuntime` owns the repeated process:

```text
state + context → navigate vocabulary → leaf
capability leaf → validate effects → execute handler → observe new state → repeat
meaning/control leaf → return according to deterministic policy
```

The runtime enforces turn, depth, effect, approval, and no-progress boundaries.
Capabilities are registered functions with declared effects; Jev cannot invent
one or bypass the policy.

Effect enforcement checks declarations, not JavaScript behavior: handlers remain
responsible for actual permissions and external effects. Applications can supply
`verifyCompletion(state)` to make completion depend on observed facts rather
than a stop choice or a handler's `done` flag. Optional `onDecision` and `onTurn`
callbacks expose selection and committed transitions. See
[the lifecycle contract](OBSERVABLE-RUNTIME.md) and
[the agent integration guide](AGENT-GUIDE.md).

## Compatible focused modules

The original focused modules remain importable compatibility surfaces. New
programs can use the vocabulary runtime directly.

## Will Gate

The Will Gate lets Jev choose its next posture from those currently legal:

```text
TALK | CHOOSE | ACT | WAIT | STOP
```

The caller defines which postures are legal and provides handlers. Jev chooses the posture. Neither the Will Gate nor the orchestrator can invent a handler, capability, permission, or side effect.

## Independent powers

### Oracle

Searches an expandable hierarchical lexicon. The default lexicon contains 100 universal symbols. Categories and words can be added at runtime or recursively loaded from JSON directories.

Large vocabularies use exhaustive Jev shortlist batches and a Jev final. There is no keyword fallback.

### Cortex

Provides direct choices, Boolean judgments, and ordered scores over supplied alternatives.

### Navigator

Operates over an environment interface:

```text
observe(state) → current legal transitions
Jev points → selected transition
transition(state, selection) → new state
repeat
```

The environment owns reality and transitions. The included Node filesystem environment is read-only, root-confined, symlink-averse, and depth-clamped to four.

### Commander

Points through a fixed action grammar:

```text
family → operation → target
```

It only returns inert proposals with `dryRun: true`. Commander has no executor;
the separate semantic runtime does invoke registered application capabilities.

### Voice

Jev selects a speech act, traceable fact, and style. Deterministic templates render the resulting sentence. No LLM writes on Jev’s behalf.

## Shared infrastructure

- `PointKernel`: required real-Jev provider, validation, diagnostics, deadlines.
- `TraceLedger`: append-only SHA-256 hash chain.
- `CapabilityRegistry`: independent manifests and implementations.
- `pointAcross`: exhaustive hierarchical choice reduction for large spaces.
- `JevOneOrchestrator`: bounded Will Gate cycles and explicit handlers.
- `VocabularyRegistry`: validated expandable domain languages.
- `VocabularyEngine`: direct and recursive Jev pointing through vocabularies.
- `IndexedVocabulary`: permanent numbered board for dynamic observed lists.
- `RuntimeCapabilityRegistry`: explicit effect-labelled program functions.
- `SemanticRuntime`: bounded state/observation/capability loop.

## Hard boundaries

1. The shipped package has no fake, heuristic, offline, or LLM fallback provider.
2. Jev points only within explicit choices.
3. Deterministic code owns legal choices, permissions, effects, budgets, and termination.
4. Environment observations own facts.
5. Commander cannot execute its proposals.
6. Voice can only express supplied traceable facts.
7. Modules remain independently importable and extensible.
