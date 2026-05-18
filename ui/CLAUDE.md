# CLAUDE.md — protospy UI

When starting work here, run `cd ui/` once as your first command — the shell working directory persists across Bash calls, so you won't need to prefix every command with `cd ui/ &&`.

If `CLAUDE.local.md` exists in this directory, read it for additional local guidance.

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
```

## Manual Testing

To generate traffic for testing UI features, use the example scripts documented in the "Running requests" section of `ui/README.md`. Do not try to inject state programmatically — run the scripts instead.

## Code Quality Requirements

Before reporting work as complete or committing, **all of the following must pass**:

```bash
pnpm lint
pnpm format
pnpm typecheck
pnpm test
```

If you changed code under `src/`, also run `pnpm test:coverage`. Coverage thresholds are configured in `vitest.config.ts` — see the testing section below.

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

`browser/a11y.spec.ts` runs an `@axe-core/playwright` scan on the empty page and on the inspector with an exchange selected. It currently **soft-fails** — violations are logged to the test output and attached as JSON, but the test passes regardless. Triage the logged violations before promoting to a hard-fail by swapping the array-typecheck for `expect(violations).toEqual([])` in that spec.

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

### Fixtures

Shared `EventMessage` builders live in `src/test/fixtures.ts` (`makeGetRequest`, `makePostRequest`, `makeResponse`, `makeCompleteExchange`, `makeMsearchRequest`, `makeSSEResponse`, `makeRequestWithTrace`, …). Unit and component tests import from `@ui/test/fixtures`; browser specs import from `./fixtures/exchanges` (which re-exports). When you need a new fixture variant, add it to `src/test/fixtures.ts` — do not duplicate in `browser/`.

### Coverage thresholds

`vitest.config.ts` locks a floor in `test.coverage.thresholds`. The numbers are intentionally below current measured coverage; the policy is **ratchet upward**, never down. After landing a batch of tests, run `pnpm test:coverage` and raise the thresholds to the new numbers (minus a small margin) in the same commit. `coverage/`, `playwright-report/`, and `test-results/` are gitignored.

shadcn primitives (`src/components/ui/**`), bootstrap files (`main.tsx`, `App.tsx`), CSS tokens (`theme/**`), and the `test/` and `__tests__/` directories are excluded from coverage — see the `exclude` list in the config before adding a new top-level src directory.

### Test plan and coverage audit

`docs/agents/ui/test-coverage-review.md` audits what's covered and what isn't. `docs/agents/ui/test-plan.md` lists discrete TASK items (P0–P2) for adding the missing tests, each with target file, cases, and acceptance criteria. When picking up a test-writing task, start there.

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
