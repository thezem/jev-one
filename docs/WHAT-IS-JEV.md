# Jev: the intelligence that answers by pointing

## The shortest possible explanation

Jev is a small, fast decision model.

You give it:

1. the situation;
2. one precise question;
3. a set of possible answers.

Jev points to the answer that best fits and returns a probability distribution
over the alternatives.

```text
situation + question + possible answers
                    │
                    ▼
                  JEV
                    │
                    ▼
       selected answer + probability field
```

That sounds like classification—and at the smallest scale, it is. The important
part is what happens when the possible answers are not merely labels. An answer
can stand for a meaning, a destination, an object, a tool, a UI element, an
action, a request for more information, or a decision to stop.

Jev does not need to generate the world. It only needs to point inside the world
your program gives it.

## A useful mental model

Imagine a very smart creature with no hands and almost no voice.

It cannot write an essay. It cannot invent a tool. It cannot execute a command.
It can only look at the current situation and point at one of the things placed
in front of it.

The obvious reaction is: *that is extremely limited.*

It is. That limitation is the source of its power.

Because Jev can only select from legal choices, software can safely decide what
each choice means. The intelligence remains fuzzy and semantic; the surrounding
system remains exact and deterministic.

```text
Jev owns                         Software owns
────────────────────────────    ────────────────────────────
semantic judgment               which options are legal
which option fits best          what each option does
relative probability            permissions and side effects
choosing the next direction     budgets, limits, and retries
                                 observing what really happened
                                 deciding whether the goal is complete
```

Jev supplies judgment without taking ownership of reality.

## From one point to a living loop

A single Jev call answers one bounded question. A Jev-powered system becomes
interesting when that point changes the state, and the new state becomes the
context for the next point.

```text
observe the world
      │
      ▼
show the legal choices
      │
      ▼
Jev points to one
      │
      ▼
code validates and applies it
      │
      ▼
observe what actually changed
      │
      └─────────────── repeat until verified or stopped
```

Jev itself does not have conversational memory. The application carries the
state. It can include previous choices, verified consequences, unresolved facts,
and the current objective in the next context. This gives Jev continuity without
pretending that the model independently remembers a history.

The result is a different kind of agent: not a model freely inventing its next
move, but a model repeatedly choosing among the moves that are truly possible
right now.

## What Jev can become

### A classifier

Give Jev a stable vocabulary such as `BUG`, `REQUEST`, `QUESTION`, and
`INSUFFICIENT CONTEXT`. It can route messages, detect qualities, score matches,
or judge whether a statement is supported.

This is the basic form, but not the boundary.

### A semantic vocabulary

The choices can be abstract meanings: `SIMPLIFY`, `WAIT`, `PROTECT`, `EXPLORE`,
`RELEASE`, or anything a domain needs.

The application understands what those words mean in its own context. A product
designer may interpret `SIMPLIFY` as removing steps. A game may interpret it as
reducing the number of active objectives. A coding agent may interpret it as
narrowing the change surface.

The vocabulary is the creature's language. Expanding the vocabulary expands
what it can express without changing the nature of the model.

### A pointer into any live list

Instead of asking Jev to choose named concepts, show it a numbered board:

```text
01  a file
02  a folder
03  a button
04  a nearby location
05  a possible action
06  go back
```

The numbers are permanent; their bindings are temporary. On every turn, the
program can attach `1–25` to whatever is visible now.

This simple trick lets the same pointing intelligence navigate directories,
web pages, inventories, maps, menus, code regions, search results, and tool
registries. Larger spaces can be traversed through pages or meaningful
hierarchies without presenting everything at once.

### A navigator

At each position, the environment exposes only valid next places. Jev chooses
one. The system moves, observes again, and rebuilds the list.

Navigation is therefore not a special model capability. It is repeated bounded
selection over a changing map.

### A controller

Choices can stand for actions such as `INSPECT`, `COLLECT`, `RETRY`, `ASK`,
`WAIT`, `STOP`, or `GO BACK`.

Jev chooses an intention. The application decides whether that intention is
allowed and what exact operation implements it. For risky systems, the choice
can remain a dry-run proposal until a separate authority approves it.

### A planner made from small decisions

Complex plans do not require one giant prompt. They can be assembled from a
sequence of independent or cumulative questions:

```text
Which direction?  →  Which target?  →  Which method?  →  Stop or continue?
```

Each decision is legible. Each uncertainty is visible. Each answer can be added
to the next context. The final plan is an accumulation of bounded judgments,
not a block of prose whose internal decisions are hidden.

### A second brain for larger models

A general-purpose language model is good at inventing possibilities, explaining,
writing, and adapting to open-ended situations. Jev is good at repeatedly
choosing among explicit alternatives.

Together they form a useful division of labor:

```text
general model  →  creates or discovers plausible alternatives
Jev            →  judges which supplied alternative best fits
ordinary code  →  validates, applies, and verifies the result
```

Jev does not need to replace an LLM to transform how the LLM behaves. It can be
the recurring decision tool the larger model consults at consequential forks.

## Why this is a big deal

### 1. It turns language into a software primitive

Traditional code needs crisp rules. General models return unconstrained language.
Jev sits between them: it accepts messy human context but returns a small,
structured decision that normal software can branch on.

It behaves less like a chatbot and more like a semantic `if` statement.

### 2. It makes intelligence composable

One bounded judgment may be simple. Hundreds of small judgments, connected to
state and deterministic transitions, can produce sophisticated behavior.

The unit of intelligence becomes small enough to reuse everywhere:

- choose the relevant item;
- decide whether two things match;
- select the next legal move;
- judge whether more evidence is needed;
- choose between continuing, waiting, asking, and stopping.

The same primitive can live inside a game, search tool, browser workflow,
recommendation system, code review, personal interface, or autonomous process.

### 3. It offers bounded agency

Most agent systems ask a model to invent an action and then hope the action is
valid. A Jev-shaped system reverses that relationship. The environment declares
the legal action space first. The model chooses inside it.

This does not make the result automatically correct or safe. It does make the
model's freedom visible, restrictable, and testable.

### 4. It separates judgment from authority

Jev may decide that deleting something best matches the request. That does not
give it permission to delete anything.

The application can require approval, restrict scope, force dry-run mode, apply
budgets, or remove destructive choices entirely. Intelligence recommends;
policy authorizes; deterministic code acts.

That separation is one of the missing pieces in many current agent designs.

### 5. It exposes uncertainty instead of hiding it in prose

Jev returns the whole field, not only the winner. A narrow lead tells the
application something important: the decision is ambiguous.

The system can respond differently depending on that shape:

- decisive result → continue automatically;
- close result → gather more context;
- diffuse result → ask a person or reformulate the options;
- missing answer → expose an explicit `UNKNOWN` or `NONE` choice.

Uncertainty becomes part of the control flow.

### 6. Its limitations create better architecture

Jev cannot rescue a badly designed choice set. It cannot see facts that were not
provided. It cannot invent the missing correct answer. It cannot prove that its
selection is true. It cannot verify that an external action succeeded.

Those constraints force the application to make important things explicit:

- What is the goal?
- What facts matter now?
- What choices are genuinely legal?
- What does each choice mean?
- What is the maximum search depth or turn budget?
- How will success be verified?

Designing around Jev is therefore often less about adding a model and more about
turning a vague process into a clear decision system.

## What Jev is not

Jev is not:

- a conversational model with its own persistent history;
- a prose generator;
- an autonomous source of tools or permissions;
- a factual oracle;
- a replacement for deterministic validation;
- a guarantee that the highest-weight answer is correct;
- a complete agent without an environment and a loop.

It is also not limited to classifying text. Text is merely one way to describe
state. The options may correspond to anything the surrounding program can
observe and bind: files, places, objects, actions, commands, people, interface
elements, or abstract meanings.

## The real design shift

The old question is:

> How do we make a model generate the right action?

The Jev-shaped question is:

> How do we design a world where pointing is enough?

That shift is the big idea.

Instead of giving a model an empty text box and unlimited implied authority, we
give it a language, a visible state, and a bounded set of real possibilities.
Then we let it choose, observe the consequence, and choose again.

Jev is small at the point of decision. The systems built from those points do
not have to be small at all.
