# CLAUDE.md — protospy UI

Run all commands from `ui/`. (On the host macOS sandbox, run `cd ui/` once first — see `docs/agents/host-sandbox.md`.)

If `CLAUDE.local.md` exists in this directory, read it for additional local guidance.

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the deep architecture reference — libraries, the SSE → store → render data flow, type shapes, design patterns, and a per-directory file map. Read it before making non-trivial changes to the app.

**Keep it current:** when you change the UI's architecture, stack, data flow, or directory structure, update **both** `ARCHITECTURE.md` and the `## Architecture` section of `README.md` in the same change.

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

Before reporting work as complete or committing, **all of the following must pass**:

```bash
pnpm lint
pnpm format
pnpm typecheck
pnpm test:coverage
```

Coverage thresholds are configured in `vitest.config.ts` — see the testing section below.

These checks are enforced automatically at commit time — see
[`docs/agents/quality-gates.md`](../docs/agents/quality-gates.md).

## Test-Writing Requirements

**Every change to code under `src/` or `browser/` must include corresponding tests.** Do not consider a feature, bug fix, or refactor complete until it has test coverage. Shipping code without tests — even if the existing suite still passes — is a recurring failure mode and is not acceptable.

### Which test type to write

| What you changed                                                                     | Test type      | File pattern                    |
| ------------------------------------------------------------------------------------ | -------------- | ------------------------------- |
| Pure function (formatter, parser, reducer, decoder, utility)                         | Unit test      | `src/__tests__/*.test.ts`       |
| React component or hook (rendering, state, user interaction)                         | Component test | `src/__tests__/*.test.tsx`      |
| Visual layout, cross-component interaction, or behavior that depends on real DOM/CSS | Browser test   | `browser/*.spec.ts`             |
| Styling properties that must match a design spec (font, spacing, color, position)    | Browser test   | `browser/design-tokens.spec.ts` |

When a change spans categories, write the cheapest test that covers the behavior — prefer unit over component, component over browser. But if the behavior under test requires the real DOM or layout, don't force it into a unit test.

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
  theme/applyTheme.ts  # pure helpers — applyThemeToDOM, resolveInitialDarkMode

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

`browser/a11y.spec.ts` runs an `@axe-core/playwright` scan on the empty page and on the inspector with an exchange selected. It currently **soft-fails** — violations are recorded as `testInfo.annotations` (visible in the HTML report, silent with `--reporter=dot`) and attached as JSON, but the test passes regardless. Triage the logged violations before promoting to a hard-fail by swapping the array-typecheck for `expect(violations).toEqual([])` in that spec.

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

Shared `EventMessage` builders live in `src/test/fixtures.ts` (`makeGetRequest`, `makePostRequest`, `makeResponse`, `makeCompleteExchange`, `makeMsearchRequest`, `makeSSEResponse`, `makeRequestWithTrace`, …). Unit and component tests import from `@ui/test/fixtures`; browser specs import from `./fixtures/exchanges` (which re-exports). When you need a new fixture variant, add it to `src/test/fixtures.ts` — do not duplicate in `browser/`.

### Coverage thresholds

`vitest.config.ts` locks a floor in `test.coverage.thresholds`. These are a safety net against catastrophic regressions (someone deletes a test file), not a per-PR gate. **Do not adjust thresholds in your PR** — they are ratcheted automatically on a weekly schedule by `scripts/ratchet-coverage.ts` (via `.github/workflows/coverage-ratchet.yml`). To run the ratchet manually: `pnpm run coverage:ratchet`.

If your PR causes `pnpm test:coverage` to fail the threshold check, that means coverage dropped significantly. Investigate — you likely need to add unit or component tests. But small threshold movements (1-2 points) caused by adding code that's covered by browser tests (which Vitest can't measure) are expected and not a problem. Browser tests in `browser/` provide real coverage; the Vitest report just can't see it.

`coverage/`, `playwright-report/`, and `test-results/` are gitignored.

shadcn primitives (`src/components/ui/**`), bootstrap files (`main.tsx`, `App.tsx`), CSS tokens (`theme/**`), and the `test/` and `__tests__/` directories are excluded from coverage — see the `exclude` list in the config before adding a new top-level src directory.

## Versioning dependencies

Pin npm packages and CDN scripts to explicit versions:

- **npm packages**: pin to current major version.
- **CDN scripts** (`<script src="...">`): pin to an explicit version, e.g. `htmx.org@2.0.4`. Never use `@latest` or a bare major like `@3`.

When uncertain about the current version, look it up rather than guessing.

## Committing

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/). Use scope `ui`:

```text
feat(ui): add request detail sidebar
fix(ui): fix SSE reconnection on network error
refactor(ui): extract theme tokens
```

`pnpm format` ignores `pnpm-lock.yaml` and the generated `coverage/`, `playwright-report/`, `test-results/` directories (see `.prettierignore`); eslint ignores them too (see `eslint.config.js`). Don't add tests or source files into those directories.
