# protospy UI Architecture Invariants (`docs/ui/architecture-invariants.md`)

**Status:** the architecture-conformance target for protospy's UI — a citeable statement of
the load-bearing structural invariants the code is meant to hold. It governs *how state flows
and where logic lives* (structure), not *how things look* (appearance) or *what the UI does on
screen* (behavior).

This is the architecture sibling of two other target specs, same purpose — write the target so
review can cite it:

- `docs/ui/design-system.md` — **appearance** (which primitive backs each control, tokens,
  type scale, interaction-state rendering).
- the UI **functional spec** (PRO-332) — **behavior** (presentational/behavioral contracts of
  what the UI renders and does).

`ui/ARCHITECTURE.md` is the descriptive deep-reference (how the code works today, end to end).
This doc is the *prescriptive* distillation: the subset of `ARCHITECTURE.md` that is
**load-bearing** — where a violation is a regression, not a style preference — phrased so a
diff-scoped reviewer can recognize a breach. When the two disagree, `ARCHITECTURE.md` describes
and this doc judges; reconcile them.

> **Baseline.** This covers the durable store / pipeline / persistence invariants that the v2.3
> design-system integration does **not** touch — the subset that is stable and applicable to
> review *today*. Three further invariants are deliberately **deferred** until the v2.3
> integration settles, because they are coupled to components being reworked or to a mechanism
> being replaced: **selector discipline** (one source per derived view), **shared-helper / shell
> discipline** (display helpers and UI shells live once), and the **theme-ownership contract**
> (which v2.3 replaces with next-themes). They will be added back with current examples once the
> integration lands. Until then, the existing drift tickets (PRO-261, PRO-266, PRO-298) remain
> the authority for those areas.

---

## How to read this — for a reviewer

Each invariant is stated in four parts so a diff-scoped pass can cite it without reading the
whole codebase:

1. **Rule** — the invariant, stated crisply.
2. **Why it's load-bearing** — what breaks or silently drifts without it.
3. **Recognize a violation in a diff** — the concrete, checkable symptom to grep/scan a diff
   for. This is the part that makes the invariant *usable* by review.
4. **Canonical implementation** — the file/symbol the conformant version lives in. Cite this
   as "the established pattern" when flagging a deviation.

§1 is the named, load-bearing state-flow invariants. §2 is additional established invariants
that are equally load-bearing and documented elsewhere (gathered here for citeability).

---

## §1. Named load-bearing invariants

### 1.1 Store-as-reducer

**Rule.** All domain-state transitions (the `exchanges` Map and `ids` array — the reassembled
request/response model) go through the pure reducer `apply()` in `state/reducer.ts`. The only
store action that mutates domain state is `applyEvent`, which copy-on-writes `exchanges`/`ids`
and delegates to `apply()`. `apply()` itself imports no React, no store, and nothing with side
effects. Components and hooks never mutate exchange/body state directly.

**Why it's load-bearing.** Keeping the domain mutation in one pure function makes it
unit-testable in the Vitest **node** project without React or a DOM, and gives event handling a
single audited code path. A second mutation site (a component reaching into the Map, a hook
patching a body) would fork the reduce logic, evade the node tests, and break the copy-on-write
contract the rest of the store relies on.

**Recognize a violation in a diff.**
- A new store action (besides `applyEvent`) that writes `exchanges` or `ids` from an
  `EventMessage`, or that reimplements per-event-type merge logic.
  - *Exception that is conformant:* `setBodyDecodedBytes` writes `exchanges` but caches a
    derived byte count onto an existing body — it is **not** event reduction. A new action in
    that same narrow shape (caching a derived value onto an existing exchange, no `EventMessage`
    involved) is fine; one that ingests events is not.
- `state/reducer.ts` gaining an import of `react`, `./store`, `zustand`, `window`/`document`,
  or any module with import-time side effects.
- A component or hook calling `exchanges.set(...)`, mutating `ex.requestBody`/`responseBody`
  in place, or `.push()`ing onto `ids`.
- Mutating an `Exchange`/`BodyState` in place instead of producing a new object (see 1.1a).

**1.1a — Immutable, identity-changing updates (corollary).** Every matched event produces a
**new** `Exchange` object (and, when a body is touched, a new `BodyState` with a new `chunks`
array only when a payload is appended). `apply()` shallow-copies the prior exchange (`{ ...prev }`)
rather than mutating it; `appendBodyData` and the SSE path return new `BodyState`s.
*Why:* identity-based memoization (`React.memo`, `useMemo` keyed on `body`/`Exchange`) must see
streaming updates — in-place mutation would leave object identity unchanged and the UI would
silently miss appended chunks/events. *Recognize a violation:* an `apply()`/helper change that
assigns to a field of `prev` directly, or reuses the prior `BodyState` when a payload was
appended. *Canonical:* `appendBodyData`, the `{ ...prev }` copy in `apply()`
(`state/reducer.ts`).

**Canonical implementation.** `apply()` and the per-event-type merges in `state/reducer.ts`;
the copy-on-write wrapper `applyEvent` in `state/store.ts`.

---

### 1.2 Derive, don't store

**Rule.** Values computable from existing state are **derived at read time**, not duplicated
into a stored field. The filtered/ordered visible-exchange list is recomputed each render from
`ids`, `exchanges`, `filter`, `traceFilter`, and `order`. The selected exchange is resolved from
`selectedId` + `exchanges`, not held as its own object. Stored state is the minimal source
(ids, the map, and UI inputs like `filter`/`order`/`selectedId`); everything downstream is a
function of it.

**Why it's load-bearing.** A cached derived field is a second source of truth that goes stale —
the store would then need invalidation logic on every input change, which is exactly the bug
class this avoids. The store stays a thin set of inputs; correctness lives in pure derivation.

**Recognize a violation in a diff.**
- A new store field (and setter) holding something derivable: e.g. `filteredExchanges`,
  `visibleIds`, `selectedExchange`, `orderedList`, a cached count, a memoized filter result.
- A `set(...)` call inside `applyEvent`/a setter that recomputes and stores a filtered/ordered/
  counted view alongside the raw inputs.
- `partialize` (the persisted-prefs allowlist) gaining a derived field.

**Canonical implementation.** The render-time derivation in `ExchangeList` (`ExchangeList.tsx`,
the `filtered`/`ordered` chain) and the mirrored resolution in `Inspector` (`Inspector.tsx`);
the store holds only `ids`, `exchanges`, `filter`, `traceFilter`, `order`, `selectedId`.

---

### 1.3 Body-decode pipeline — the one path from bytes to rendered body

**Rule.** Rendering a body never touches raw chunks directly. Two canonical paths, by body
type:

- **Non-SSE bodies:** `BodyPane` → `useDecodeBody(body)` (`hooks/useDecodeBody.ts`) →
  `decodeBody(body)` (`body/decode.ts`). `decodeBody` is the sole pure async pipeline:
  concat chunks → decompress (`gzip`/`deflate` via `DecompressionStream`; `br`/`zstd` via
  lazy-loaded WASM singletons) → `TextDecoder` → classify (`jsonl` before `json`, then
  `binary`, else `text`). `useDecodeBody` only runs once `body.atEnd === true`, guards stale
  results via a `cancelled` flag and a `body`-identity check.
- **SSE bodies (`text/event-stream`):** parsed **incrementally in the reducer** via
  `body/sse-stream.ts` (`feedChunk` is O(chunk), not O(total stream)); parsed events live in
  `BodyState.sseState` and `chunks` stays empty. `StreamView`/`ChatStreamView` read
  `sseState.events` directly — **no** component-layer parse. Retention is capped at
  `MAX_SSE_EVENTS`.

**Why it's load-bearing.** Body decoding is async, lazy (WASM), order-sensitive
(`jsonl` must precede `json` because ndjson MIME types contain "json"), and streaming-aware.
A component decoding bytes itself would re-derive this fragile sequence, miss the
decompression/classification rules, risk loading WASM eagerly, and break the
decode-only-when-complete and stale-guard contracts. The SSE split exists because re-parsing
the whole stream per chunk is O(n²); a component-layer SSE parse reintroduces that.

**Recognize a violation in a diff.**
- A component reading `body.chunks` directly to render (calling `atob`, `TextDecoder`,
  `JSON.parse`, or `DecompressionStream` outside `body/decode.ts`).
- A new body-classification or decompression branch added in a component instead of in
  `decodeBody`'s classify steps.
- Reordering `decodeBody`'s classify so JSON is checked before JSONL.
- A `StreamView`/`ChatStreamView` (or new SSE view) that parses `body.chunks`/raw SSE text
  instead of reading `sseState.events`; or SSE chunks being accumulated into `chunks` in the
  reducer instead of fed through `feedChunk`.
- Decode work running before `body.atEnd`, or dropping the `cancelled`/`body`-identity stale
  guards in `useDecodeBody`.
- Importing the brotli/zstd WASM at module top level (eager) instead of via the existing lazy
  singletons.

**Canonical implementation.** `decodeBody` (`body/decode.ts`), `useDecodeBody`
(`hooks/useDecodeBody.ts`), `BodyPane` (`components/BodyPane.tsx`); SSE incremental path in
`body/sse-stream.ts` (`feedChunk`/`applyRetention`) wired from `state/reducer.ts`
(`initialBodyToState`/`appendBodyData`).

---

## §2. Additional established invariants

These are equally load-bearing and already conformant; they are documented in
`ARCHITECTURE.md` / `ui/CLAUDE.md` and gathered here so the conformance pass can cite them in
one place. A reviewer should treat a breach of any of these as a regression.

### 2.1 Pure helpers over hooks

**Rule.** Formatting, classification, URI parsing, filtering, trace coloring, header
masking/sorting, size formatting, and SSE badge classification are pure functions in
`lib/utils.ts`; stream-state derivation is the pure `deriveStreamState`. Components stay thin
and call these. New shared logic of this kind is a pure function with a node unit test, not
logic embedded in a component/hook.

**Recognize a violation.** A new formatter/classifier/parser defined inline in a component
when it is (or should be) shared and pure; business logic placed in a hook that has no
React-state/effect reason to be a hook. **Canonical:** `lib/utils.ts`,
`deriveStreamState` (`components/LiveIndicator.tsx`).

### 2.2 Generated wire types are read-only

**Rule.** Types under `@bindings/*` (→ `../bindings/`) are generated from the Rust backend by
ts-rs and must not be hand-edited; the UI adapts at the reducer boundary
(`initialBodyToState` normalizes `InitialBody` → the local `BodyState`). UI-local model
shapes (`Exchange`, `BodyState`) live in `state/reducer.ts`, not in bindings.

**Recognize a violation.** Any edit under `bindings/`; a UI-only field added to a `@bindings`
type instead of to `Exchange`/`BodyState`. **Canonical:** `state/reducer.ts` (`Exchange`,
`BodyState`, `initialBodyToState`).

### 2.3 Persistence boundary (`partialize` + stable key)

**Rule.** Only UI *preferences* persist, via the `partialize` allowlist in `state/store.ts`,
under the `localStorage` key `protospy-ui-prefs`. Transient/domain state (`exchanges`, `ids`,
`selectedId`, `filter`, `connection`, …) is never persisted. The key is not renamed without a
migration; schema changes bump the persist `version` and add a migration (cf. the 0→1
`darkMode`→`theme` migration).

**Recognize a violation.** `partialize` gaining domain/transient state (or a derived field —
see 1.2); the persist `name` key changed without migration; a persisted-shape change without a
`version` bump + migration. **Canonical:** the `persist(...)` config in `state/store.ts`.

### 2.4 Test-harness hooks are load-bearing

**Rule.** `window.__test_store` (`state/store.ts`) and `window.__test_scenes` (`main.tsx` from
`src/test/scenes.ts`) are exposed under `import.meta.env.DEV || VITE_EXPOSE_TEST_HOOKS ===
"true"` and tree-shaken from production. The Playwright harness (`browser/helpers/inject.ts`,
`browser/helpers/scenes.ts`) drives the store through them. Do not remove them or change the
exposure gate.

**Recognize a violation.** Removal/renaming of either hook; exposing them unconditionally
(leaking into production); the fixture matrix (`SCENES` / `applySceneToStore`) bypassed by a new
ad-hoc injection path. **Canonical:** the gated assignment at the bottom of `state/store.ts`;
the `__test_scenes` install in `main.tsx`; `src/test/scenes.ts`.

---

## Deferred invariants

Three invariants are intentionally **not** stated above, pending the v2.3 design-system
integration. Each is coupled to code that integration reworks or replaces; documenting it now
would anchor the spec to structure that is about to change. Add each back — with current
examples and canonical symbols — once the relevant v2.3 work lands.

- **Selector discipline (one source per derived view).** The visible-exchanges derivation
  (`ids → exchanges.get → matchesFilter → traceFilter → reverse-if-newest`) should exist once
  and be reused, not re-implemented per consumer. Currently implemented in multiple places and
  tracked by **PRO-261**; the surfaces that hold the copies (`ExchangeList`, `Inspector`,
  `FilterBar`) are among those v2.3 integrates. Re-state once the target selector exists and the
  surfaces have settled.
- **Shared-helper / shell discipline (display helpers and UI shells live once).** Cross-surface
  display helpers (body-size formatting) and UI shells (`SearchInput`, `StatusDot`, `PaneHeader`)
  should live once. Tracked by **PRO-266** (helper) and **PRO-298** (shells); both touch
  components v2.3 reworks, and the shell roster itself may change under the new design system.
  Re-state against the post-integration component set.
- **Theme-ownership contract (single runtime DOM writer for theme).** The current invariant —
  exactly two writers of `<html data-theme>` (the `index.html` bootstrap and the store
  `subscribeWithSelector` subscription) — is **replaced** by v2.3's adoption of next-themes
  (`.dark`-on-`<html>`). Re-state the ownership contract in terms of the next-themes
  `ThemeProvider` once the foundation slice (PRO-345) lands.

---

## Maintenance

When the structural architecture changes, update this doc alongside `ARCHITECTURE.md`, the
`README.md` Architecture section, and the `ui/CLAUDE.md` TL;DR (per
`docs/agents/tldr-maintenance.md`). When a deferred invariant's blocking work lands, add it back
to §1/§2 with its current canonical symbol and diff-recognition symptoms, and drop it from the
**Deferred invariants** list.
