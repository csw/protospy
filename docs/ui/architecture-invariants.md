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

> **Draft for ratification.** This was agent-drafted from the code + `ARCHITECTURE.md` for
> Clayton to ratify (PRO-334). Invariants whose *intent* is clear from the code are stated as
> rules; genuinely uncertain ones are quarantined under
> [§4 Candidate invariants](#4-candidate-invariants--needs-ratification). Three of the named
> invariants (§1.3, §1.5) are **target** invariants the code does **not** yet fully satisfy —
> their current drift is tracked by open tickets and called out per-invariant under
> *Conformance*.

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

Where current code already drifts from a target invariant, a **Conformance** line names the
open ticket so a reviewer doesn't re-file known drift — but *new* code in a diff must still
conform (don't add a fourth copy because three already exist).

§1 is the five named load-bearing invariants. §2 is additional established invariants that are
equally load-bearing and already documented elsewhere (gathered here for citeability). §3 is the
reconciliation of the three known drift tickets. §4 is the ratification queue.

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

### 1.3 Selector discipline — one source per derived view

**Rule.** Each distinct derived view has **exactly one** definition, consumed everywhere it is
needed. Specifically, the "visible exchanges" derivation — the
`ids → exchanges.get → matchesFilter(filter) → traceFilter → reverse-if-newest` chain — must
exist once and be reused; it must not be re-implemented per consumer.

**Why it's load-bearing.** This is the failure mode of 1.2 done *three times*. When the same
predicate chain is copy-pasted across consumers, a filter-semantics change (a new matched field,
a different trace rule, changed ordering) must be made in every copy or they silently disagree —
the list shows one set of rows while the count claims another. One source means one edit.

**Recognize a violation in a diff.**
- A second/third occurrence of the `ids.map((id) => exchanges.get(id)).filter(... matchesFilter
  ...)` chain, or any re-implementation of the same filter/order/trace predicate, in a new or
  existing component.
- A consumer computing its own filtered **count** (e.g. `ids.filter(...).length`) instead of
  deriving from the shared visible list.
- A change to filter/order/trace semantics that edits one call site but not the others.

**Canonical implementation.** *Target:* a single derived selector/hook (PRO-261 proposes
`useVisibleExchanges()` returning the ordered array). *Today:* the derivation is implemented
in **three** places — `ExchangeList.tsx`, `Inspector.tsx`, and `FilterBar.tsx` (the count).
`ARCHITECTURE.md` currently describes the `ExchangeList`/`Inspector` pair as an *intentional*
mirror; the `FilterBar` third copy is what tips it from "deliberate mirror" to drift.

**Conformance.** **Open — currently violated.** Tracked by **PRO-261**. The invariant is the
target; a reviewer should block any diff that adds a *fourth* copy or diverges one of the
existing three, and should reference PRO-261 rather than re-filing. See §3 and §4.1 (the
"intentional mirror" tension is a ratification item).

---

### 1.4 Body-decode pipeline — the one path from bytes to rendered body

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

### 1.5 Shared-helper / shell discipline — display logic and UI shells live once

**Rule.** Cross-component **display helpers** (pure formatting/labeling shared by ≥2 surfaces)
live as one pure function in `lib/utils.ts`; cross-component **UI shells** (a repeated
icon+input+clear box, status dot, pane-header bar) live as one shared component. They are not
re-implemented per call site.

This invariant has two named, currently-open instances:

- **Body-size display** — the wire/decoded/encoding size string (with `shortEncoding()`
  normalization and tooltip text) belongs in one helper in `lib/utils.ts`, consumed by every
  size-display surface.
- **UI shells** — `SearchInput` (icon + input + clear), `StatusDot` (state→colored dot), and
  `PaneHeader` (the `h-[30px] bg-bg-sub border-b border-border` header bar) belong in shared
  components under `components/` (or `components/ui/`), consumed by every site.

**Why it's load-bearing.** Re-implemented display logic drifts behaviorally, not just
visually: e.g. `TimingView`'s body-size copy uses raw `contentEncoding` instead of
`shortEncoding()`, so `Content-Encoding: identity` shows "(identity)" in Timing but nothing in
the list views — the same exchange reports two different sizes. Duplicated shells drift in
focus ring, clear-button behavior, and token usage, and multiply the surface every later
refactor (Button adoption, header-contrast fixes) must touch.

**Recognize a violation in a diff.**
- A new (or copy-pasted) inline computation of `wire`/`decoded`/encoding size + tooltip in a
  component, instead of calling the shared helper. Symptom: `formatSize(...)` interleaved with
  `shortEncoding`/`contentEncoding` branching and a `title=`/tooltip string built in a
  component body.
- A raw `<input>` wrapped in the
  `flex items-center … rounded-[4px] bg-bg-sub border border-border … focus-within:border-border-focus`
  box with a Search icon and clear `X`, re-declared in a component instead of using the shared
  `SearchInput`.
- A `w-[7px] h-[7px] rounded-full bg-{green|amber|red} … [animate-pulse]` status dot built
  inline (a `connectionDot`/`connectionDotClass`-style local helper) instead of a shared
  `StatusDot` taking a state enum.
- A `h-[30px] … bg-bg-sub border-b border-border` pane-header bar re-declared inline instead
  of a shared `PaneHeader`.

**Canonical implementation.** *Body-size:* **target** — one helper in `lib/utils.ts`
(PRO-266 proposes `formatBodySize(body)` returning a data object callers render);
`shortEncoding()` (already shared, `lib/utils.ts`) is the encoding-normalization piece.
*Shells:* **target** — `SearchInput`/`StatusDot`/`PaneHeader` shared components (PRO-298).
`LiveIndicator` (`components/LiveIndicator.tsx`) is the shape to follow: a pure display
component driven by a state enum, config in one record.

**Conformance.** **Open — currently violated.**
- Body-size display is duplicated across **four** sites: `ExchangeListItem.inlineSize()`,
  `ExchangeList.TableRow` (inline `sizeTitle`), `TimingView.bodySizeDisplay()`, and
  `BodyPane`'s inline size span. PRO-266 scopes the first three (the `BodyPane` copy is treated
  as separate-and-correct there); the behavioral divergence above is the live bug. Tracked by
  **PRO-266**.
- The three shells are duplicated: `SearchInput` across `FilterBar.tsx` + `HeadersPane.tsx`;
  `StatusDot` across `TopBar.connectionDotClass`, `StatusBar.connectionDot`,
  `LiveIndicator`; `PaneHeader` across `BodyPane`, `StreamView`, `ChatStreamView`,
  `HeadersSplit` (`HeadersPanel`), `ExchangeList` (toolbar + table header). Tracked by
  **PRO-298**.

A reviewer should block a diff that adds a *new* copy of any of these, citing the ticket. The
*granularity threshold* (when a repeated `className` is a shareable shell vs. acceptable
incidental duplication) is a ratification item — see §4.2.

---

## §2. Additional established invariants

These are equally load-bearing and already conformant; they are documented in
`ARCHITECTURE.md` / `ui/CLAUDE.md` and gathered here so the conformance pass can cite them in
one place. A reviewer should treat a breach of any of these as a regression.

### 2.1 Single runtime DOM writer for theme (theme ownership contract)

**Rule.** Exactly two code paths write `<html data-theme>`: the pre-React bootstrap IIFE in
`index.html` (first paint) and the `subscribeWithSelector` subscription on the `theme` slice
in `state/store.ts` (runtime). `setTheme` only updates store state. No other code —
component, effect, `onRehydrateStorage` — touches the attribute.

**Recognize a violation.** Any `document.documentElement.setAttribute("data-theme", …)` /
`classList` theme write outside those two sites; a component effect applying the theme; an
`onRehydrateStorage` that touches the DOM. **Canonical:** the subscription + `onThemeChange`
in `state/store.ts`; `applyThemeToDOM`/`resolveTheme` in `theme/applyTheme.ts`.

### 2.2 Pure helpers over hooks

**Rule.** Formatting, classification, URI parsing, filtering, trace coloring, header
masking/sorting, size formatting, and SSE badge classification are pure functions in
`lib/utils.ts`; theming logic is pure in `theme/applyTheme.ts`; stream-state derivation is the
pure `deriveStreamState`. Components stay thin and call these. New shared logic of this kind is
a pure function with a node unit test, not logic embedded in a component/hook.

**Recognize a violation.** A new formatter/classifier/parser defined inline in a component
when it is (or should be) shared and pure; business logic placed in a hook that has no
React-state/effect reason to be a hook. **Canonical:** `lib/utils.ts`, `theme/applyTheme.ts`,
`deriveStreamState` (`components/LiveIndicator.tsx`).

### 2.3 Generated wire types are read-only

**Rule.** Types under `@bindings/*` (→ `../bindings/`) are generated from the Rust backend by
ts-rs and must not be hand-edited; the UI adapts at the reducer boundary
(`initialBodyToState` normalizes `InitialBody` → the local `BodyState`). UI-local model
shapes (`Exchange`, `BodyState`) live in `state/reducer.ts`, not in bindings.

**Recognize a violation.** Any edit under `bindings/`; a UI-only field added to a `@bindings`
type instead of to `Exchange`/`BodyState`. **Canonical:** `state/reducer.ts` (`Exchange`,
`BodyState`, `initialBodyToState`).

### 2.4 Persistence boundary (`partialize` + stable key)

**Rule.** Only UI *preferences* persist, via the `partialize` allowlist in `state/store.ts`,
under the `localStorage` key `protospy-ui-prefs`. Transient/domain state (`exchanges`, `ids`,
`selectedId`, `filter`, `connection`, …) is never persisted. The key is not renamed without a
migration; schema changes bump the persist `version` and add a migration (cf. the 0→1
`darkMode`→`theme` migration).

**Recognize a violation.** `partialize` gaining domain/transient state (or a derived field —
see 1.2); the persist `name` key changed without migration; a persisted-shape change without a
`version` bump + migration. **Canonical:** the `persist(...)` config in `state/store.ts`.

### 2.5 Test-harness hooks are load-bearing

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

## §3. Reconciliation — the three known drift tickets

Each was "a thing drifted because the invariant wasn't written down." Status: all three are in
**Backlog** (unimplemented) as of this draft, so each invariant below is the **target**; the
code currently drifts, tracked by the ticket. The invariant is now written down, so the #4
conformance pass can cite it to stop *new* drift even before the cleanup lands.

| Ticket | Drift | Covering invariant | Covered? |
| --- | --- | --- | --- |
| **PRO-261** | `ids→get→matchesFilter→traceFilter→reverse` chain re-implemented in `ExchangeList`, `Inspector`, and `FilterBar` (count) — change one and the count silently disagrees with the list. | **§1.3 Selector discipline** (one source per derived view). | **Covered.** §1.3 names this exact chain and the "compute your own count" symptom. Open caveat: the "intentional mirror" framing needs ratification — §4.1. |
| **PRO-266** | Body-size display logic in 3–4 copies; `TimingView` skips `shortEncoding()`, so `identity` renders inconsistently. | **§1.5 Shared-helper discipline** (display helpers live once in `lib/utils.ts`). | **Covered.** §1.5 names the four sites, the `shortEncoding()` divergence, and the inline-`formatSize`+tooltip symptom. |
| **PRO-298** | `SearchInput` / `StatusDot` / `PaneHeader` shells duplicated across many components. | **§1.5 Shell discipline** (UI shells live once as shared components). | **Covered.** §1.5 names all three shells, their duplication sites, and a per-shell diff symptom. Open caveat: the duplication-vs-shareable threshold needs ratification — §4.2. |

No drift ticket is deferred — all three are covered by §1.3/§1.5.

---

## §4. Candidate invariants — needs ratification

These look like invariants from the code but I can't tell from the source alone whether the
*intent* matches what I've written, so they're quarantined here rather than asserted above.

### 4.1 Should the `ExchangeList`/`Inspector` derivation be a single source, or is the mirror intentional?

§1.3 asserts *one* source for the visible-exchanges derivation. But `ARCHITECTURE.md` currently
states the `ExchangeList`/`Inspector` derivation is an **intentional** mirror ("they
intentionally mirror the same derivation"), while PRO-261 treats *all three* copies (adding
`FilterBar`) as drift to collapse. These conflict. **Ratify:** is the target a single
`useVisibleExchanges()` consumed by all three (PRO-261's framing — recommended, and what §1.3
is written to), or is a deliberate two-site mirror acceptable with only the third (count) copy
forbidden? If the former, `ARCHITECTURE.md`'s "intentional mirror" sentence should be updated to
match when PRO-261 lands.

### 4.2 What is the granularity threshold for "shared shell" (§1.5)?

§1.5 forbids re-implementing shells like `PaneHeader`/`SearchInput`/`StatusDot`. But not every
repeated `className` warrants extraction — over-abstracting one-off bars would be its own
problem. PRO-298 names exactly three shells with specific duplication counts. **Ratify:** is the
invariant "these three named shells must be shared" (narrow, enumerated — recommended for a
review pass, since it's unambiguously checkable), or a general "≥N duplications of a structural
shell must be extracted" rule (broader, but needs an N and a definition of "structural shell" a
reviewer can apply)? I've written §1.5 to the named-three reading and listed the general
principle as the rationale.

### 4.3 Is `setBodyDecodedBytes` the *only* sanctioned non-`applyEvent` writer of `exchanges`?

§1.1 treats `setBodyDecodedBytes` as a conformant exception (it caches a derived value onto an
existing body, it doesn't reduce events). I've generalized that to "actions in that same narrow
shape are fine." **Ratify:** is that generalization intended, or should §1.1 be stricter —
`applyEvent` and `setBodyDecodedBytes` are the *only* two sanctioned writers of `exchanges`, and
any third (even a derived-value cache) needs explicit sign-off?

---

## Maintenance

When the structural architecture changes, update this doc alongside `ARCHITECTURE.md`, the
`README.md` Architecture section, and the `ui/CLAUDE.md` TL;DR (per
`docs/agents/tldr-maintenance.md`). When a drift ticket (PRO-261/266/298) lands, flip its
**Conformance** line from "Open — currently violated" to conformant and point the canonical
implementation at the real shared symbol, and resolve any related §4 ratification item.
