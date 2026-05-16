# CLAUDE.md — protospy UI

## Commands

```bash
pnpm dev             # start dev server
pnpm build           # production build (output: dist/)
pnpm add <package>   # add a dependency
pnpm format          # format
pnpm lint            # lint
pnpm typecheck       # type check
pnpm test            # run unit + component tests (Vitest)
pnpm test:coverage   # run with v8 coverage report
pnpm test:e2e        # run Playwright e2e tests (browsers must be installed)
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
    fixtures.ts        # shared EventMessage builders (imported by both unit and e2e)
  hooks/               # extracted hooks (testable in isolation)
  lib/utils.ts         # pure helpers — formatters, matchers, splitUri, etc.
  theme/applyTheme.ts  # pure helpers — applyThemeToDOM, resolveInitialDarkMode

e2e/
  *.spec.ts            # Playwright specs
  fixtures/exchanges.ts  # one-line re-export of src/test/fixtures.ts
  helpers/inject.ts    # waitForStore, resetStore, injectExchanges, getStoreState
```

### Test types

| Type      | File            | Vitest project | Environment | Use for                                                  |
| --------- | --------------- | -------------- | ----------- | -------------------------------------------------------- |
| Unit      | `*.test.ts`     | `node`         | node        | Pure functions: formatters, parsers, reducers, decoders. |
| Component | `*.test.tsx`    | `jsdom`        | jsdom       | React components + hooks. jest-dom matchers available.   |
| E2E       | `e2e/*.spec.ts` | (Playwright)   | chromium    | Integration through real DOM + store; not real network.  |

Vitest auto-selects the project from file extension. **Any module that touches `localStorage`, `window`, or `document` at import time must be tested under `jsdom`** (`.test.tsx` extension). This includes anything that transitively imports `state/store.ts` — though after the v2 refactor the store no longer side-effects at import.

`@testing-library/jest-dom@^6` matchers are auto-imported via `src/test/setup.ts` for the `jsdom` project — use `toBeInTheDocument`, `toHaveTextContent`, `toHaveClass`, `toBeDisabled`, etc. instead of raw DOM querying.

### E2E framing

The `e2e/` suite uses Playwright but is really an **integration** suite, not a true end-to-end suite. Tests inject `EventMessage`s directly into the Zustand store via `window.__test_store.applyEvent(...)` and stub `/info` and `/service/.../events` via `page.route`. The real `EventSource` code path is never exercised. This is fine for verifying rendering against known state, but reconnection / large-body / compressed-body / SSE-stream behavior is **not** covered by e2e — those gaps go in `src/__tests__/` or need a dedicated e2e that drives `page.route` honestly.

The `__test_store` dev-mode window exposure in `state/store.ts` is intentional and load-bearing for the e2e harness; do not remove it.

### Fixtures

Shared `EventMessage` builders live in `src/test/fixtures.ts` (`makeGetRequest`, `makePostRequest`, `makeResponse`, `makeCompleteExchange`, `makeMsearchRequest`, `makeSSEResponse`, `makeRequestWithTrace`, …). Unit and component tests import from `@ui/test/fixtures`; e2e specs import from `./fixtures/exchanges` (which re-exports). When you need a new fixture variant, add it to `src/test/fixtures.ts` — do not duplicate in `e2e/`.

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
