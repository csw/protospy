# CLAUDE.md — protospy UI

Run all commands from `ui/`. (On the host macOS sandbox, run `cd ui/` once first — see `docs/agents/host-sandbox.md`.)

If `CLAUDE.local.md` exists in this directory, read it for additional local guidance.

## Architecture

For the deep reference (exact `EventMessage` shape, reducer per-event-type rules, the full body decode pipeline, design-token policy, test-architecture detail), read [`ARCHITECTURE.md`](./ARCHITECTURE.md). The TL;DR below is enough for localized single-component work — but if your change touches any load-bearing or architectural concern, read the deep doc first. That includes, but is not limited to, the SSE pipeline, store shape, reducer, body decode, theming/tokens, persistence/`partialize`, the `__test_store`/`__test_scenes` test hooks, the test project split, or the directory layout. When unsure whether a concern is architectural, read it.

**Keep both current:** when you change the UI's architecture, stack, data flow, or directory structure, update `ARCHITECTURE.md`, the `## Architecture` section of `README.md`, and the TL;DR below in the same change. See [`docs/agents/tldr-maintenance.md`](../docs/agents/tldr-maintenance.md) for the regeneration prompt.

### TL;DR

**Stack.** React ^19 + TypeScript ^6, Zustand ^5 (with `persist` middleware), `@tanstack/react-virtual` ^3, Radix ^1.4 primitives (shadcn `new-york` wrappers under `components/ui/`), `cmdk` ^1, `react-resizable-panels` ^4, Tailwind v4 (no `tailwind.config.js` — tokens live in `theme/tailwind.css` under `@theme`, dark variant bound to `[data-theme=dark]`). Vite ^8, Vitest ^4 (node + jsdom projects), Playwright. **React Compiler is not run here** — `eslint-plugin-react-hooks@7` surfaces the compiler's static checks at lint time only.

**Data flow.** `index.html` bootstraps the theme from the persist key (`protospy-ui-prefs`) before React loads; `main.tsx` renders `AppShell`, and the store's `subscribeWithSelector` subscription on the `theme` slice reconciles store→DOM at runtime (see the ownership contract in `theme/applyTheme.ts`). `AppShell` calls `fetchInfo()` (`api/info.ts` → `GET /info`) once and then `subscribeToEvents(service, …)` (`api/sse.ts` → `EventSource` at `/service/<name>/events`). Each `"exchange-report"` named event is `JSON.parse`d into an `EventMessage` and passed to `applyEvent(msg)` on the store. `applyEvent` copy-on-writes `exchanges` (a `Map<number, Exchange>`) and `ids`, then delegates to the **pure reducer** `apply()` in `state/reducer.ts` (testable without React in the node Vitest project). Components subscribe to slices via `useStore(selector)`; both `ExchangeList` and `Inspector` re-derive the filtered/ordered visible list each render.

**Types.** Wire types come from `@bindings/*` (→ `../bindings/`, generated from Rust by ts-rs — **do not edit**). `@ui/*` → `./src/*`.

**Bodies.** Never touch chunks directly. `BodyPane` → `useDecodeBody(body)` (only runs once `body.atEnd === true`) → `decodeBody()` in `body/decode.ts`: concat chunks → decompress (`gzip`/`deflate` via `DecompressionStream`; `br` via `brotli-dec-wasm` WASM, lazy-loaded; `zstd` via `@bokuweb/zstd-wasm` WASM, lazy-loaded) → `TextDecoder` → classify as `jsonl` / `json` / `binary` / `text`. SSE bodies (`text/event-stream`) are parsed incrementally in the reducer via `body/sse-stream.ts` — each chunk is fed through `feedChunk()` (O(chunk), not O(total stream)), parsed events live in `BodyState.sseState`, and `chunks` stays empty. `StreamView`/`ChatStreamView` read `sseState.events` directly (no component-layer parse). Retention is bounded at `MAX_SSE_EVENTS` (10,000). Shared scroll-follow logic is in `hooks/useStreamFollow.ts`; shared event rendering in `components/EventsView.tsx` (virtualized with `@tanstack/react-virtual`). Anthropic transcripts fold via `anthropic/transcript.ts`.

**Load-bearing details — don't break these:**

- `window.__test_store` in `state/store.ts` is required by the Playwright harness (`browser/helpers/inject.ts`). Exposed when `import.meta.env.DEV` **or** `VITE_EXPOSE_TEST_HOOKS === "true"` (from `.env.test`, set by `pnpm build:test` — the build the browser suite previews); tree-shaken from a plain `pnpm build`. Do not remove.
- `window.__test_scenes`, installed by `main.tsx` from `src/test/scenes.ts` under the same gate as `__test_store`, is the **fixture matrix** used by the visual-review workflow (PRO-229). Each `SCENES` cell is an injectable UI state; `browser/fixture-matrix.spec.ts` walks them. See `docs/fixture-matrix.md`.
- Persisted prefs `localStorage` key is `protospy-ui-prefs`; the `partialize` list in `state/store.ts` defines which UI prefs persist. Renaming the key strands users.
- `state/reducer.ts` is pure on purpose so it can be unit-tested in the `node` project. Do not import React, the store, or anything with side effects into it.

**Directory map (compressed; full annotations in `ARCHITECTURE.md`):**

- `src/api/` — `info.ts` (`fetchInfo`, `/info`), `sse.ts` (`subscribeToEvents`, `ConnectionStatus`, parent-frame `postMessage`)
- `src/state/` — `store.ts` (Zustand + `subscribeWithSelector` + `persist` + theme subscriber + dev `__test_store`), `reducer.ts` (pure `apply`, `Exchange`/`BodyState` shapes)
- `src/body/` — `decode.ts` (chunks→bytes→decompress→classify), `sse.ts` (parseSSEBlock, parseSSEBody, chunksToText), `sse-stream.ts` (SSEStreamState, feedChunk, applyRetention — incremental SSE parser)
- `src/anthropic/` — `transcript.ts` (fold SSE events into chat transcript)
- `src/protocol/` — protocol-aware UI gating (`showPairsTab` for ES/OpenSearch)
- `src/hooks/` — `useDecodeBody`, `useRelativeTime` (backed by `lib/tickSource.ts` shared 1 Hz singleton), `useStreamFollow` (shared scroll-follow for SSE views)
- `src/lib/` — `utils.ts` (`cn`, formatters incl. `formatAbsoluteTime`/`TimeZone`, matchers, trace colors, header helpers), `tickSource.ts`
- `src/theme/` — `tailwind.css` (`@theme` tokens + dark variant + `@theme inline` shadcn semantic aliases + `@layer base` default border-color), `applyTheme.ts` (`ThemePreference` type, `DEFAULT_THEME`, `resolveTheme`, `applyThemeToDOM`, theme ownership contract)
- `src/components/` — app components (`AppShell`, `TopBar`, `FilterBar`, `ExchangeList`, `Inspector`, `BodySplit`, `StreamView`, `EventsView`, `HeadersSplit`, `JsonViewer`, `TimingView`, `CommandPalette`, …); vendored shadcn primitives under `components/ui/`
- `src/test/` (`setup.ts`, `fixtures.ts`, `scenes.ts` — fixture matrix + `window.__test_scenes`), `src/__tests__/` (Vitest)
- `browser/` — Playwright specs (incl. `fixture-matrix.spec.ts`) + `helpers/inject.ts` (drives the store via `window.__test_store`) + `helpers/scenes.ts` (drives `window.__test_scenes`); `browser/fixtures/exchanges.ts` re-exports `src/test/fixtures.ts`
- `docs/fixture-matrix.md` — the injectable state matrix and how to reach each cell

## Commands

```bash
pnpm dev             # start dev server
pnpm build           # production build (output: dist/)
pnpm add <package>   # add a dependency
pnpm format          # format
pnpm lint            # lint
pnpm typecheck       # type check
pnpm test --reporter=dot            # run unit + component tests (Vitest); omit --reporter=dot for human-readable output
pnpm test:coverage                  # run with v8 coverage report
pnpm test:browser --reporter=dot    # run Playwright browser tests (browsers must be installed); omit --reporter=dot for human-readable output
just screenshots                    # regenerate hero screenshots — run from REPO ROOT, not ui/; ui/justfile has a same-named recipe but it skips the required cargo build step
```

## Manual Testing

To generate traffic for testing UI features, use the example scripts documented in the "Running requests" section of `ui/README.md`. Do not try to inject state programmatically — run the scripts instead.

## Code Quality Requirements

Before reporting work as complete, **all of the following must pass**:

```bash
pnpm lint
pnpm format
pnpm typecheck
pnpm test:coverage
```

`pnpm test:coverage` (unit + component tests plus a coverage report) is your
iterative-development feedback loop: run it after making changes to confirm they
work and stay covered, well before you think the work is done. Coverage thresholds
are configured in `vitest.config.ts` — see the testing section below.

**Do not run `pnpm test:coverage` or `pnpm test:browser` immediately before
`git commit`.** The pre-commit hook runs the identical suites automatically (see
[`docs/agents/quality-gates.md`](../docs/agents/quality-gates.md)), so a manual run
right beforehand only repeats ~30–60s of work and its token output for no extra
signal. The commit is the gate — let the hook run the suites, then fix any failures
it reports and re-commit.

## Definition of Done (any change affecting rendered output)

Passing lint/typecheck/tests is necessary but not sufficient for any change that affects
what the UI renders or how it behaves on screen — this includes changes to reducers,
hooks, selectors, or formatters whose output is visible, not only changes to components or
CSS. Such a change is "done" only when it also clears the **frontend Definition of Done**
([`../docs/frontend-dod.md`](../docs/frontend-dod.md)): the `/design-review` rubric plus
protospy-specific requirements —

- every **fixture-matrix** state renders correctly (the matrix lives in
  `src/test/scenes.ts`, reachable via `window.__test_scenes`; the full cell list and
  injection calls are in [`docs/fixture-matrix.md`](./docs/fixture-matrix.md)),
- at 1280/1440/1920 in both light and dark themes,
- with clipping affordances, pane bounds respected, and no new console errors.

The `visual-review` subagent automates this check (see the root `CLAUDE.md` "Visual
design reviews" section); it does **not** replace the deterministic `browser/` tests
below.

## Test-Writing Requirements

**Every change to code under `src/` or `browser/` must include corresponding tests.** Do not consider a feature, bug fix, or refactor complete until it has test coverage. Shipping code without tests — even if the existing suite still passes — is a recurring failure mode and is not acceptable.

### Which test type to write

| What you changed                                                                     | Test type      | File pattern                    |
| ------------------------------------------------------------------------------------ | -------------- | ------------------------------- |
| Pure function (formatter, parser, reducer, decoder, utility)                         | Unit test      | `src/__tests__/*.test.ts`       |
| React component or hook (rendering, state, user interaction)                         | Component test | `src/__tests__/*.test.tsx`      |
| Visual layout, cross-component interaction, or behavior that depends on real DOM/CSS | Browser test   | `browser/*.spec.ts`             |
| Styling properties that must match a design spec (font, spacing, color, position)    | Browser test   | `browser/design-tokens.spec.ts` |

When a change spans categories, cover _each_ distinct observable behavior with the cheapest test that exercises it — prefer unit over component, component over browser per behavior. A single cheap test that covers only one layer of a multi-layer change is not sufficient. But if a behavior under test requires the real DOM or layout, don't force it into a unit test.

### What "covered" means

- New exported functions or components must have at least one test exercising their primary behavior.
- Bug fixes must include a test that would have caught the bug (the "regression test" rule).
- Refactors that change observable behavior (even subtly — e.g. a different empty-state message) must update or add assertions covering the new behavior.
- If a change is purely internal (renaming a local variable, reformatting) and no observable behavior changed, no new test is needed — but the existing suite must still pass.

### Common failure mode

Agents have repeatedly shipped UI features with zero test coverage, requiring expensive backfill passes after the fact. The root cause is treating "tests pass" as sufficient when the real bar is "tests _exist_ for the code I wrote." If you are about to commit and have not written or updated any test file, stop and ask yourself what you missed.

## Testing

### Layout

```
src/
  __tests__/           # Vitest unit + component tests
  test/
    setup.ts           # jsdom-project setup (jest-dom matchers)
    fixtures.ts        # shared EventMessage builders (imported by both unit and browser)
  hooks/               # extracted hooks (testable in isolation)
  lib/utils.ts         # pure helpers — formatters, matchers, splitUri, etc.
  theme/applyTheme.ts  # pure helpers — ThemePreference, DEFAULT_THEME, resolveTheme, applyThemeToDOM

browser/
  *.spec.ts            # Playwright browser tests (UI rendering, layout, interaction)
  fixtures/exchanges.ts  # one-line re-export of src/test/fixtures.ts
  helpers/inject.ts    # waitForStore, resetStore, injectExchanges, getStoreState
```

### Test types

| Type      | File                | Vitest project | Environment | Use for                                                                  |
| --------- | ------------------- | -------------- | ----------- | ------------------------------------------------------------------------ |
| Unit      | `*.test.ts`         | `node`         | node        | Pure functions: formatters, parsers, reducers, decoders.                 |
| Component | `*.test.tsx`        | `jsdom`        | jsdom       | React components + hooks. jest-dom matchers available.                   |
| Browser   | `browser/*.spec.ts` | (Playwright)   | chromium    | UI rendering, layout, interaction through real DOM + store. Not network. |

Vitest auto-selects the project from file extension. **Any module that touches `localStorage`, `window`, or `document` at import time must be tested under `jsdom`** (`.test.tsx` extension). This includes anything that transitively imports `state/store.ts` — though after the v2 refactor the store no longer side-effects at import.

`@testing-library/jest-dom@^6` matchers are auto-imported via `src/test/setup.ts` for the `jsdom` project — use `toBeInTheDocument`, `toHaveTextContent`, `toHaveClass`, `toBeDisabled`, etc. instead of raw DOM querying.

`browser/a11y.spec.ts` runs an `@axe-core/playwright` scan on the empty page and on the inspector with an exchange selected. It is **advisory, not a gate** — a11y is low priority for protospy (no screen-reader target), so axe violations never fail the test, block merge, or fail pre-commit. Violations surface as `console.warn` lines in the test output and are also recorded as `testInfo.annotations` (HTML report) and attached as JSON for triage detail. The scan keeps the full WCAG tag set, so keyboard/focus rules still run — keyboard/focus quality remains the a11y bar.

### Browser test scope and framing

The `browser/` suite uses Playwright to codify a manual verification process for UI rendering, layout, and interaction. It is **not** an end-to-end suite — tests inject `EventMessage`s directly into the Zustand store via `window.__test_store.applyEvent(...)` and stub `/info` and `/service/.../events` via `page.route`. The real `EventSource` code path is never exercised. Reconnection / large-body / compressed-body / SSE-stream behavior is **not** covered by `browser/` — those gaps go in `src/__tests__/` or need a dedicated browser test that drives `page.route` honestly.

The directory is called `browser/` rather than `e2e/` for two reasons: (1) it names the execution context accurately, and (2) it reserves `e2e/` for a future true full-stack suite if one ever lands.

The `__test_store` dev-mode window exposure in `state/store.ts` is intentional and load-bearing for the browser harness; do not remove it.

### Browser-test patterns worth knowing

A few non-obvious techniques that came out of writing the suite:

- **`route.fulfill` is atomic — there is no Playwright streaming primitive.** Once you fulfill, the response delivers and the TCP connection closes in one tick. To park a connection (e.g. to keep an `EventSource` in CONNECTING long enough to assert on), `await` an external gate inside the handler before calling `route.fulfill`. See `sse-reconnect.spec.ts` for the pattern.
- **Hook `__test_store` before the app assigns it.** A subscriber installed via `page.evaluate` after `waitForStore` will miss the initial state transitions. Use `page.addInitScript` plus an `Object.defineProperty` setter on `window.__test_store` to attach the subscriber the moment the store mounts. Again, `sse-reconnect.spec.ts` demonstrates this.
- **Record transitions rather than racing `expect.poll`.** Fleeting state changes (sub-100 ms) can fall between poll samples. Push every change into an array via a store subscriber, then assert on the recorded sequence (indices, ordering) after driving the cycle.
- **Scrolling: walk the overflow ancestors.** When a nested element carries `aria-label` but its parent owns the `overflow-auto`, setting `scrollTop` on the inner element silently no-ops. Set it on each ancestor up the chain and take the max — see `body-large.spec.ts`.

### Design token fidelity tests

`browser/design-tokens.spec.ts` spot-checks that key rendered CSS properties match the design spec. This exists because styling drift is hard to catch — agents translating CSS to Tailwind classes will round values to the nearest utility class, and the result looks "close enough" visually but diverges on exact font sizes, weights, spacing, etc.

The pattern: inject an exchange so elements render, then use `page.evaluate()` with `getComputedStyle()` to extract the actual rendered value and assert it against the design spec value.

```typescript
const badge = page.locator('[data-testid="method-badge"]').first();
const styles = await badge.evaluate((el) => {
  const cs = getComputedStyle(el);
  return { fontFamily: cs.fontFamily, fontWeight: cs.fontWeight };
});
expect(styles.fontFamily).toContain("JetBrains Mono");
expect(styles.fontWeight).toBe("600");
```

**When to add assertions here:** when a design spec defines an exact CSS property value that Tailwind might approximate. High-drift-risk properties: font-family, font-size, font-weight, letter-spacing, border-radius, padding, position (sticky). Don't test every property on every element — focus on values that have drifted before or that use non-standard Tailwind values (arbitrary values like `text-[11.5px]`).

**When NOT to use this:** for conditional styling logic (method badge changes color by HTTP method), write a regular component or browser test that exercises the condition. Design token tests are for static property fidelity, not behavioral assertions.

### Fixtures

Shared `EventMessage` builders live in `src/test/fixtures.ts` (`makeGetRequest`, `makePostRequest`, `makeResponse`, `makeCompleteExchange`, `makeMsearchRequest`, `makeSSEResponse`, `makeRequestWithTrace`, plus data-extreme builders `makeLongUriRequest`, `makeManyExchanges`, `makeDualSizeResponse`, …). Unit and component tests import from `@ui/test/fixtures`; browser specs import from `./fixtures/exchanges` (which re-exports). When you need a new fixture variant, add it to `src/test/fixtures.ts` — do not duplicate in `browser/`.

`src/test/scenes.ts` composes these builders into the **fixture matrix**: `SCENES`, a list of injectable UI-state cells (one per matrix cell), the pure `applySceneToStore` applier, and the dev-only `window.__test_scenes` harness. The browser breadth check is `browser/fixture-matrix.spec.ts`; the full matrix and per-cell injection calls are documented in `docs/fixture-matrix.md`. Add a new cell by appending to `SCENES`.

### Coverage thresholds

Coverage thresholds live in `coverage-thresholds.json` and are read by `vitest.config.ts` at startup. They are a safety net against catastrophic regressions (someone deletes a test file), not a per-PR gate. **Do not adjust thresholds in your PR** — they are ratcheted automatically on a weekly schedule by `scripts/ratchet-coverage.ts` (via the repo-root workflow `.github/workflows/coverage-ratchet.yml` — at the repo root, not under `ui/`). To run the ratchet manually: `pnpm run coverage:ratchet`.

If your PR causes `pnpm test:coverage` to fail the threshold check, that means coverage dropped significantly. Investigate — you likely need to add unit or component tests. But small threshold movements (1-2 points) caused by adding code that's covered by browser tests (which Vitest can't measure) are expected and not a problem. Browser tests in `browser/` provide real coverage; the Vitest report just can't see it.

`coverage/`, `playwright-report/`, and `test-results/` are gitignored.

shadcn primitives (`src/components/ui/**`), bootstrap files (`main.tsx`, `App.tsx`), CSS tokens (`theme/**`), and the `test/` and `__tests__/` directories are excluded from coverage — see the `exclude` list in the config before adding a new top-level src directory.

## Versioning dependencies

Pin dependencies in `package.json` (added with `pnpm add`) to their current major version, and look up the current version rather than guessing. See `docs/agents/dependencies.md` for the full cross-type pinning policy.

## Committing

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/). Use scope `ui`:

```text
feat(ui): add request detail sidebar
fix(ui): fix SSE reconnection on network error
refactor(ui): extract theme tokens
```

`pnpm format` ignores `pnpm-lock.yaml` and the generated `coverage/`, `playwright-report/`, `test-results/` directories (see `.prettierignore`); eslint ignores them too (see `eslint.config.js`). Don't add tests or source files into those directories.
