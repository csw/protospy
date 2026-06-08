---
paths:
  - "ui/browser/**/*"
  - "ui/src/__tests__/**/*"
  - "ui/src/test/**/*"
  - "ui/vitest.config.ts"
---

# UI testing — deep reference

This is the deep "how to write each kind of UI test" reference. It loads on
demand when you read files under `ui/browser/`, `ui/src/__tests__/`, or
`ui/src/test/` (the test directories) — it is **not** always-on context.

The always-on testing **policy** lives in `ui/CLAUDE.md`: that every change to
`ui/src/` or `ui/browser/` needs tests, which test type to write for which kind
of change, and what "covered" means. This file is the mechanics behind that
policy. Read it before writing a browser test or a design-token test.

## Layout

```
src/
  __tests__/           # Vitest unit + component tests
  test/
    setup.ts           # jsdom-project setup (jest-dom matchers)
    fixtures.ts        # shared EventMessage builders (imported by both unit and browser)
  hooks/               # extracted hooks (testable in isolation)
  lib/utils.ts         # pure helpers — formatters, matchers, splitUri, etc.
  theme/theme.ts       # pure helpers — ThemePreference, DEFAULT_THEME, resolveDefaultTheme

browser/
  *.spec.ts            # Playwright browser tests (UI rendering, layout, interaction)
  fixtures/exchanges.ts  # one-line re-export of src/test/fixtures.ts
  helpers/inject.ts    # waitForStore, resetStore, injectExchanges, getStoreState
```

## Test types

| Type      | File                | Vitest project | Environment | Use for                                                                  |
| --------- | ------------------- | -------------- | ----------- | ------------------------------------------------------------------------ |
| Unit      | `*.test.ts`         | `node`         | node        | Pure functions: formatters, parsers, reducers, decoders.                 |
| Component | `*.test.tsx`        | `jsdom`        | jsdom       | React components + hooks. jest-dom matchers available.                   |
| Browser   | `browser/*.spec.ts` | (Playwright)   | chromium    | UI rendering, layout, interaction through real DOM + store. Not network. |

Vitest auto-selects the project from file extension. **Any module that touches `localStorage`, `window`, or `document` at import time must be tested under `jsdom`** (`.test.tsx` extension). This includes anything that transitively imports `state/store.ts` — though after the v2 refactor the store no longer side-effects at import.

`@testing-library/jest-dom@^6` matchers are auto-imported via `src/test/setup.ts` for the `jsdom` project — use `toBeInTheDocument`, `toHaveTextContent`, `toHaveClass`, `toBeDisabled`, etc. instead of raw DOM querying.

`browser/a11y.spec.ts` runs an `@axe-core/playwright` scan on the empty page and on the inspector with an exchange selected. It is **advisory, not a gate** — a11y is low priority for protospy (no screen-reader target), so axe violations never fail the test, block merge, or fail pre-commit. Violations surface as `console.warn` lines in the test output and are also recorded as `testInfo.annotations` (HTML report) and attached as JSON for triage detail. The scan keeps the full WCAG tag set, so keyboard/focus rules still run — keyboard/focus quality remains the a11y bar.

## Browser test scope and framing

The `browser/` suite uses Playwright to codify a manual verification process for UI rendering, layout, and interaction. It is **not** an end-to-end suite — tests inject `EventMessage`s directly into the Zustand store via `window.__test_store.applyEvent(...)` and stub `/info` and `/service/.../events` via `page.route`. The real `EventSource` code path is never exercised. Reconnection / large-body / compressed-body / SSE-stream behavior is **not** covered by `browser/` — those gaps go in `src/__tests__/` or need a dedicated browser test that drives `page.route` honestly.

The directory is called `browser/` rather than `e2e/` for two reasons: (1) it names the execution context accurately, and (2) it reserves `e2e/` for a future true full-stack suite if one ever lands.

The `__test_store` dev-mode window exposure in `state/store.ts` is intentional and load-bearing for the browser harness; do not remove it.

## Browser-test patterns worth knowing

A few non-obvious techniques that came out of writing the suite:

- **`route.fulfill` is atomic — there is no Playwright streaming primitive.** Once you fulfill, the response delivers and the TCP connection closes in one tick. To park a connection (e.g. to keep an `EventSource` in CONNECTING long enough to assert on), `await` an external gate inside the handler before calling `route.fulfill`. See `sse-reconnect.spec.ts` for the pattern.
- **Hook `__test_store` before the app assigns it.** A subscriber installed via `page.evaluate` after `waitForStore` will miss the initial state transitions. Use `page.addInitScript` plus an `Object.defineProperty` setter on `window.__test_store` to attach the subscriber the moment the store mounts. Again, `sse-reconnect.spec.ts` demonstrates this.
- **Record transitions rather than racing `expect.poll`.** Fleeting state changes (sub-100 ms) can fall between poll samples. Push every change into an array via a store subscriber, then assert on the recorded sequence (indices, ordering) after driving the cycle.
- **Scrolling: walk the overflow ancestors.** When a nested element carries `aria-label` but its parent owns the `overflow-auto`, setting `scrollTop` on the inner element silently no-ops. Set it on each ancestor up the chain and take the max — see `body-large.spec.ts`.

## Design token fidelity tests

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

## Fixtures

Shared `EventMessage` builders live in `src/test/fixtures.ts` (`makeGetRequest`, `makePostRequest`, `makeResponse`, `makeCompleteExchange`, `makeMsearchRequest`, `makeSSEResponse`, `makeRequestWithTrace`, plus data-extreme builders `makeLongUriRequest`, `makeManyExchanges`, `makeDualSizeResponse`, …). Unit and component tests import from `@ui/test/fixtures`; browser specs import from `./fixtures/exchanges` (which re-exports). When you need a new fixture variant, add it to `src/test/fixtures.ts` — do not duplicate in `browser/`.

`src/test/scenes.ts` composes these builders into the **fixture matrix**: `SCENES`, a list of injectable UI-state cells (one per matrix cell), the pure `applySceneToStore` applier, and the dev-only `window.__test_scenes` harness. The browser breadth check is `browser/fixture-matrix.spec.ts`; the full matrix and per-cell injection calls are documented in `docs/fixture-matrix.md`. Add a new cell by appending to `SCENES`.

## Coverage thresholds

Coverage thresholds live in `coverage-thresholds.json` and are read by `vitest.config.ts` at startup. They are a safety net against catastrophic regressions (someone deletes a test file), not a per-PR gate. **Do not adjust thresholds in your PR** — they are ratcheted automatically on a weekly schedule by `scripts/ratchet-coverage.ts` (via the repo-root workflow `.github/workflows/coverage-ratchet.yml` — at the repo root, not under `ui/`). To run the ratchet manually: `pnpm run coverage:ratchet`.

If your PR causes `pnpm test:coverage` to fail the threshold check, that means coverage dropped significantly. Investigate — you likely need to add unit or component tests. But small threshold movements (1-2 points) caused by adding code that's covered by browser tests (which Vitest can't measure) are expected and not a problem. Browser tests in `browser/` provide real coverage; the Vitest report just can't see it.

`coverage/`, `playwright-report/`, and `test-results/` are gitignored.

shadcn primitives (`src/components/ui/**`), bootstrap files (`main.tsx`, `App.tsx`), CSS tokens (`theme/**`), and the `test/` and `__tests__/` directories are excluded from coverage — see the `exclude` list in the config before adding a new top-level src directory.
