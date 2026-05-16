# protospy UI v2 — Test Coverage Review

## Scope

The v2 rewrite of the protospy UI (under `ui/`) shipped on the `ui-v2`
branch with a new Playwright browser-test suite alongside the unit tests
preserved from v1. This document audits coverage on `ui-v2` and the
small refactor branch built on top of it, identifies gaps, and points
at the companion **[test plan](./test-plan.md)** for the handoff.

The review was done with Vitest 4.1.5, Playwright 1.60, React 19, and
TypeScript 6.

## What this session changed

Three test-enabling refactors landed before the audit was finalised so
the test plan can target the post-refactor shape:

1. **`refactor(ui): move theme bootstrap out of module-load time`** —
   `state/store.ts` previously called `initDarkMode()` at module-load
   time, hitting `localStorage` and `window.matchMedia` as a side
   effect of `import`. That made the store impossible to import in
   pure node tests. The side-effect bootstrap moved to `main.tsx`
   (where browser globals already exist) and the pure helpers
   `applyThemeToDOM`, `resolveInitialDarkMode`, `persistDarkMode` live
   in `src/theme/applyTheme.ts`. `toggleDarkMode` action uses the same
   helpers. Store init now defaults `darkMode: false`; `main.tsx` syncs
   it to the resolved value before render to avoid flash.
2. **`refactor(ui): extract pure helpers to lib/utils.ts`** —
   `splitUri`, `parseQueryParams`, `shortenTraceId`, and
   `isBulkOperation` were inlined or duplicated across several
   components. Moved to `src/lib/utils.ts`; call sites updated to
   import. `ContextBar`'s trace-ID truncation boundary aligned to
   match `FilterBar`'s (`>= 8` chars).
3. **`refactor(ui): move useDecodeBody hook to src/hooks/`** — the hook
   was nested inside `BodyPane.tsx`, untestable in isolation. Moved to
   `src/hooks/useDecodeBody.ts`.

All three commits preserve external behavior. After them, `state/store`
and `useDecodeBody` are reachable from unit tests without DOM setup.

## Test infrastructure changes

- `vitest.config.ts` uses Vitest 4's `projects` field to split into a
  `node` project (`.test.ts`) and a `jsdom` project (`.test.tsx`), so
  component tests no longer need a per-file `@vitest-environment`
  directive. Shared aliases and coverage config live in the root
  config; both projects extend it.
- `@testing-library/jest-dom@^6` matchers wired in via
  `src/test/setup.ts` (jsdom project only).
- `@vitest/coverage-v8@^4` configured with text/html/lcov reporters.
  Baseline thresholds locked at the v2 floor minus a small margin
  (stmt 28 / branch 14 / fn 11 / line 31). The test-plan tasks ratchet
  these up.
- Browser-test fixtures relocated to `src/test/fixtures.ts` so unit
  tests can reuse them. `browser/fixtures/exchanges.ts` becomes a
  one-line re-export.
- Playwright suite renamed `e2e/` → `browser/` (with the npm script
  `test:browser` and CI job `test-browser`). The directory name is
  now honest about what the suite is — UI rendering / layout /
  interaction — and reserves `e2e/` for a future true full-stack
  suite if one ever lands.
- Playwright config: CI retries=2, workers=1, trace on first retry,
  screenshot/video on failure, HTML + GitHub reporters on CI.
- `ui-ci.yml`: cache `~/.cache/ms-playwright` keyed on the lockfile;
  browser-test artifact upload restricted to `failure()` and extended
  to include `test-results/`; unit `test` job promoted to run
  `pnpm run test:coverage` and upload the coverage report as an
  artifact. The browser job was already wired in on `ui-v2` (as
  `test-e2e`); only the rename, cache, artifact conditions, and
  reporter polish are new.
- `.prettierignore` updated so `pnpm format` no longer churns the
  lockfile or report directories.

## Coverage summary (post-refactor baseline)

Vitest v8 coverage on the existing test suite:

```
Statements   : 29.98% ( 239/797 )
Branches     : 15.92% (  96/603 )
Functions    : 13.21% (  30/227 )
Lines        : 33.33% ( 223/669 )
```

Per-file highlights:

| File                             | Stmt %  | Notes                                              |
| -------------------------------- | ------- | -------------------------------------------------- |
| `body/decode.ts`                 | 92.6    | gzip path covered; deflate / charset / BOM unhit   |
| `body/sse.ts`                    | 100     | tokenization and Anthropic extraction covered      |
| `state/reducer.ts`               | 93.0    | Request/Response/BodyData/Error events covered     |
| `components/CopyButton.tsx`      | 86.7    | sole tested component                              |
| `components/JsonViewer.tsx`      | 82.2    | `tokenizeLine` covered, renderer not               |
| `lib/utils.ts`                   | **0**   | every formatter / matcher untested                 |
| `state/store.ts`                 | **0**   | now importable in node tests; still has no tests   |
| `hooks/useDecodeBody.ts`         | **0**   | newly extracted, no tests yet                      |
| All other components             | 0       | rely entirely on the Playwright suite              |

## What the browser-test suite covers

The Playwright suite (`ui/browser/*.spec.ts`, 72 tests) exercises:

- Filter bar — method/path/status filtering, case insensitivity, clear,
  count display, trace-filter chip.
- Exchange list — rows + table modes, sort order, density,
  pending / error states.
- Inspector — empty state, Bodies / Req headers / Res headers / Timing
  tabs labels, Stream tab label for SSE responses, Pairs tab for
  msearch.
- Command palette — open/close, toggle dark mode / density / view /
  trace grouping, exchange search.
- Layout — both panels visible, separator dragging, virtual scroll with
  200 exchanges.
- Theme — light/dark toggle, status text colors, method badge colors,
  connection indicator states.
- Keyboard navigation — j/k/arrow keys, filter-input suppression,
  bounds.
- Context bar — method/status/path, prev/next nav, disabled-edge
  states, trace pill, query param strip, elapsed pill.

**Framing**: the suite codifies a manual verification process for UI
rendering, layout, and interaction. It is not an end-to-end suite.
Tests inject `EventMessage`s directly into the store via
`window.__test_store.applyEvent(...)` and stub `/info` and
`/service/.../events` via `page.route`. The real EventSource code path,
SSE reconnection, and any actual network behavior are never exercised.
The directory name (`browser/`) reflects this scope; the previous
`e2e/` name was misleading. A separate true end-to-end suite could
live under `e2e/` in the future without conflict.

## Gaps

Grouped by where new tests would land. The companion **[test plan](./test-plan.md)**
turns each item into a discrete TASK with cases and acceptance
criteria.

### Zero-coverage modules

- `lib/utils.ts` — pure formatters. `formatSize`, `statusClass`,
  `methodBadgeClass`, `methodTextClass`, `statusTextClass`,
  `statusChipClass`, `traceColor`, `formatTime`, `matchesFilter`, plus
  the newly extracted `splitUri`, `parseQueryParams`, `shortenTraceId`,
  `isBulkOperation`. Highest-payoff target.
- `state/store.ts` — action creators (`applyEvent`, `setListWidth`,
  `toggleTraceGroup`, `toggleDarkMode`) and their DOM/localStorage
  side effects. Now safe to import in node tests because of the
  bootstrap refactor.
- `hooks/useDecodeBody.ts` — state machine (loading → done / failed,
  cancellation on body change, cleanup on unmount).
- `theme/applyTheme.ts` — `resolveInitialDarkMode` branch table.

### Gaps within already-tested modules

- `state/reducer.ts` — tracer/traceparent edge cases (malformed
  versions, missing fields, duplicate `traceparent`). `getHeader`
  semantics on duplicate headers. BodyData with out-of-order
  `content.offset`.
- `body/sse.ts` — field-parsing edge cases (colons in values, empty
  field names). Malformed Anthropic events (missing `delta.type`,
  missing `usage`, non-text-delta types).
- `api/sse.ts` — concurrent error events, message arriving after
  `cleanup()` is called, non-`exchange-report` event types ignored.
- `body/decode.ts` — deflate / deflate-raw branches. `charset` and BOM
  on text content-type. Empty body. Malformed base64 chunk.
- `CopyButton.tsx` — rapid double-click, unmount mid-timer
  (`act()` warning), clipboard rejection path (currently swallowed).
- `api/info.ts` — fetch reject, response without `services`, body
  throws on `.json()`.
- `JsonViewer.tsx` `tokenizeLine` — string escapes (`\"`, `\\`, `\n`,
  `\uXXXX`), scientific notation, brackets `[]`.

### Browser-test gaps

- SSE reconnection: simulate connection drop via `page.route`, verify
  status pill cycles `open → reconnecting → open`.
- Large body rendering (≥ 1 MB JSON): no script-timeout, viewer
  remains responsive.
- Binary body: `Bytes` payload renders as a "binary, N bytes"
  placeholder.
- Compressed body: gzip payload decoded inline (mirrors the unit
  decode test fixture).
- Multi-event SSE Stream tab: ≥ N events render as N rows.
- Multi-filter intersection: method + status + URI substring shrinks
  list correctly.
- Resize boundaries: drag separator to min and max; clamping behaves;
  listWidth persists across mode switch.
- Service selection: `/info` returns multiple services; switching
  re-subscribes to the new service.
- localStorage persistence across reload: dark mode persists, density
  / order persist if intended.
- Relative timestamps: mock the clock and verify "Xs ago" updates.
- Accessibility smoke: `@axe-core/playwright` scan on initial load and
  with an inspector open. Soft-fail initially.

### Browser-test flake risks to de-flake

- `layout.spec.ts` uses `await page.waitForTimeout(500)` to wait for
  virtual scroll to settle. Replace with `expect.poll()` against
  rendered row count.
- Several specs assert computed `getComputedStyle(el).color` against
  literal `rgb(...)` strings. Brittle to design-token changes. Replace
  with `expect(el).toHaveClass('text-green')` (now ergonomic thanks to
  jest-dom).

## Known issues — refactors explicitly deferred

These came up in the structural review but were out of scope for this
session. Each is logged in the **[test plan](./test-plan.md)** as a
known issue so the next session can decide per item.

- `api/sse.ts` has no explicit reconnect backoff or give-up semantics.
  `EventSource` reconnects natively and the code already emits
  `reconnecting` → `open`, so this works, but there's no diagnostic
  signal when reconnect fails repeatedly. Worth revisiting once the
  browser-test reconnect spec exists.
- `CopyButton.tsx` swallows `navigator.clipboard.writeText` rejections
  and still shows "Copied!". Either route through an error UI or log.
- `lib/utils.ts` `formatTime` hardcodes `en-US`. Switch to `undefined`
  locale once the unit tests pin the format expectation.
- Filter+order derivation duplicated across `ExchangeList`, `Inspector`,
  and `CommandPalette`. Extract into a `useFilteredOrderedExchanges`
  hook once a use-case forces it.
- `api/info.ts` doesn't catch `.json()` parse errors. Two-line fix;
  defer to a follow-up.
- `window.__test_store` exposed on dev — needed by the current
  browser-test harness; keep until the harness is reshaped.

## Tooling gaps observed but not addressed

- No visual regression (Percy, Playwright snapshots) — could be added
  once the UI stabilizes.
- No mutation testing (Stryker) — not worth wiring at current
  coverage levels.
- No Codecov / PR-comment coverage integration. The lcov report is
  uploaded as a CI artifact; promoting to a PR comment is a follow-up
  once the floor stabilises.
- No automated accessibility checks. `@axe-core/playwright` is the
  obvious add; covered in the test plan as a P2 task.

## How to use the test plan

`docs/agents/ui/test-plan.md` lists discrete TASKs grouped by
priority. Each TASK gives target file, test type, cases to cover, and
acceptance criteria. The intent is that a fresh session can pick any
TASK, execute it without re-reading this audit, and land an
independent commit. After each batch, run `pnpm test:coverage` and
ratchet the thresholds in `vitest.config.ts` upward.
