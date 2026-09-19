# Recommendations that continue across sessions

`jev.profiles` holds portable feedback. `jev.recommend` uses that feedback and
current context to select from your catalog. Your application owns persistence,
identity, permissions, and the source of candidates. No database dependency,
background worker, automatic model training, or generated fallback is involved.

## Create, record, save, restore

With an initialized `jev` instance from the [README](../README.md):

```js
const profile = jev.profiles.create({ preferences: 'Thoughtful sci-fi, little violence.' });
const event = profile.record({
  itemId: 'arrival',
  action: 'liked',
  item: { title: 'Arrival', genres: ['science fiction'], minutes: 116 },
});
profile.record({ itemId: 'movie-42', action: 'dismissed' });

const json = JSON.stringify(profile.export()); // save this wherever your app wants
const restored = jev.profiles.restore(JSON.parse(json));
restored.record({ itemId: 'another-film', action: 'watched' });
```

`export()` returns a detached object containing `version: 1`, a stable profile
`id`, explicit `preferences`, and `events`. Each event has a stable `id`, ISO
`at` timestamp, `itemId`, `action`, and optional JSON-compatible `item` snapshot.
Snapshots let feedback retain meaning after catalog changes. Without one, only
the ID and action are available: the library does not fetch the old item for you.
Provide concise relevant attributes, not credentials or unnecessary personal data.

Actions are application-defined nonempty strings, such as `liked`, `dismissed`,
`purchased`, or `completed`. They remain observations; dismissal is not automatically
converted into dislike of a category. Recording is synchronous and makes no model
call. It affects future recommendations, not a run already in progress.

The whole profile is preserved on export. By default recommendations send the
most recent **50 events** plus explicit preferences to the provider. Set
`historyLimit` to change that count (zero sends no events); the result reports
used and omitted counts. Older history is not summarized or secretly deleted.
Keep individual snapshots small: a count limit is not a token limit.

```js
profile.forget(event.id); // remove a mistaken event; returns whether it existed
profile.record({ itemId: 'arrival', action: 'disliked' }); // corrected feedback
profile.setPreferences('Short documentaries tonight.');
profile.clearHistory(); // retains profile ID and explicit preferences
```

Restoring rejects unknown versions, malformed events, duplicate event IDs, and
non-JSON values. Storage writes, encryption, retention, and concurrent-session
conflicts belong to the app. Use transactions or revision checks when multiple
requests update one saved profile; snapshots are not an automatic merge protocol.

## Recommend from an array

```js
const result = await jev.recommend({
  items: movies,
  profile: restored,
  context: 'Watching with my partner; we have 90 minutes.',
  eligible: movie => movie.minutes <= 90 && movie.available,
  describe: movie => ({
    id: movie.id,
    label: movie.title,
    description: `${movie.genres.join(', ')}; ${movie.minutes} minutes`,
  }),
  minItems: 3,
  maxItems: 5,
});
console.log(result.items, result.minimumMet, result.reason);
```

Without `describe`, each item needs a nonempty string `id` and `label` or `title`;
the full JSON item becomes its description. Use `describe` to restrict which
attributes go to the provider. Returned items retain their original shape and
must be structured-cloneable. Item IDs must stay stable across pages and sessions.
The first eligible occurrence of an ID wins within one run.

`eligible` is a synchronous hard filter and is checked again before selection.
It is never relaxed to meet the minimum. For live inventory or permissions,
validate against authoritative application state again before a purchase or action.
Feedback does not automatically exclude previously recommended or disliked items;
express any such exclusion in `eligible`.

## Let Jev browse your catalog

Supply **exactly one** of `items` or `source`:

```js
const result = await jev.recommend({
  profile: restored,
  context: 'Something interesting for tonight.',
  source: async ({ cursor, limit, signal }) => {
    return catalog.page({ cursor, limit, signal });
    // { items: [...], nextCursor: 'opaque-next-token' }
    // Last page: { items: [...], nextCursor: null }
  },
  pageSize: 10,
  minItems: 3,
  maxItems: 6,
  maxPages: 8,
  maxDecisions: 40,
  onSelection: item => console.log('Selected:', item),
});
```

The initial cursor is `null`. Return at most `limit` items and a new nonempty
string cursor, or null/omitted `nextCursor` for the last page. Empty pages are
allowed. Repeated cursors and oversized pages throw rather than silently dropping
candidates. Cached pages are not refetched when navigating back.

The choice board exposes current candidates plus `PREVIOUS PAGE`, `NEXT PAGE`,
and `FINISH` when legal. Selected items disappear from all further choices.
Earlier unselected candidates remain accessible. Navigation bypasses cached pages
with no remaining eligible candidates. Jev controls selection and browsing; code
enforces bounds. When exactly one legal action remains, code takes it without
spending a model call. This can include selecting the sole remaining eligible
item when a minimum is required; it is not recorded as a model decision.

`FINISH` is unavailable below `minItems`. A minimum asks for the best available
eligible choices, not a guarantee of preference quality. Exhaustion, cancellation,
or a budget may still leave it unmet. Without a minimum, Jev may finish with zero
items. Selection order is a browsing shortlist, not a calibrated global ranking;
catalog order and unseen pages can affect results. For a huge catalog, use your
existing search or retrieval layer as `source`.

## Limits and result contract

| Option | Default | Meaning |
| --- | --- | --- |
| `minItems` | 0 | Minimum requested count; must not exceed maxItems. |
| `maxItems` | 5 | Stop after this many selections; range 1–1000. |
| `pageSize` | 10 | Items per source page; range 1–22, also limited by kernel capacity. |
| `maxPages` | 8 | Maximum fetched pages, including empty ones; range 1–1000. |
| `maxDecisions` | 40 | Maximum model calls, including page navigation; range 1–10000. |
| `historyLimit` | 50 | Most recent profile events sent; range 0–10000. |

`preferences` can supply additional run-specific text without modifying the
profile. Each run snapshots profile history and uses one trace workflow ID.

Results contain `items`, `minimumMet`, `reason`, `pagesFetched`, `decisions`,
`historyEventsUsed`, and `historyEventsOmitted`. `decisions` contains actual
kernel points; deterministic sole-choice transitions do not fabricate points.

| Reason | Meaning |
| --- | --- |
| `max_items` | The maximum selection count was reached. |
| `finished` | Jev chose FINISH after satisfying the optional minimum. |
| `source_exhausted` | No unselected eligible candidates or more source pages remain. |
| `max_pages` | No remaining cached candidates, and the page budget prevents fetching more. |
| `max_decisions` | The model-call budget ended the run. |
| `aborted` | Cancellation was observed at a run boundary. |

Always inspect `minimumMet`. Weights in `decisions` describe choices among the
current alternatives, not the probability the user will like an item. No generated
explanations or satisfaction claims are added.

An optional `signal` is passed to your source. The source owns its timeout and
abort handling; model calls use the kernel deadline. Cancellation during an
in-flight call is checked before accepting its selection. Previously selected
items are retained. Provider/source errors propagate; a source may reject on
abort instead of returning an `aborted` result. `onSelection` is awaited, receives
a clone, and propagates errors. It does not automatically record feedback.

## Try the actual model

```bash
npm run build
node examples/recommendations.js
```

The [example](../examples/recommendations.js) saves/restores a profile through JSON,
serves a paginated activity catalog, applies a time restriction, and requests two
recommendations from real Jev using `AI_GATEWAY_API_KEY`. The
[mechanics tests](../test/recommendation.test.js) use private fixtures to exercise
restoration, bounds, deduplication, cancellation, and incomplete outcomes.
