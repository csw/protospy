# protospy UI v2 — Test Plan (Handoff)

Companion to **[test-coverage-review.md](./test-coverage-review.md)**.
The review explains *why*; this document is the *what and how*: one
TASK per coverage gap, executable independently.

## How to use this document

- Tasks are grouped by priority (P0 / P1 / P2) and by area within each.
- Each task is self-contained: target file, test file, cases,
  acceptance criteria. You should not need to re-read the review to
  execute one.
- After each batch, run `pnpm test:coverage` and ratchet the
  thresholds in `ui/vitest.config.ts` upward toward the new floor.
- All tasks land under `ui/src/__tests__/` (Vitest) or `ui/browser/`
  (Playwright). The Vitest project is auto-selected by file
  extension — `.test.ts` runs under `node`, `.test.tsx` under `jsdom`
  (with `@testing-library/jest-dom` matchers wired in).
- The shared fixture builders live at `ui/src/test/fixtures.ts`. Unit
  tests import directly from `@ui/test/fixtures`; browser specs
  continue to import from `./fixtures/exchanges` (it re-exports).
- Any module that touches `localStorage`, `window`, or `document` at
  import time must be tested under the `jsdom` project — that means
  `.test.tsx` extension or a manually-overridden environment.

## Definitions

- **Pure-logic test**: imports a function/module, asserts return values
  or state. Runs under the `node` project. File: `*.test.ts`.
- **Component test**: mounts a React component with
  `@testing-library/react`, asserts DOM state. Runs under `jsdom`.
  File: `*.test.tsx`. Use `@testing-library/jest-dom` matchers
  (`toBeInTheDocument`, `toHaveTextContent`, `toHaveClass`,
  `toBeDisabled`, etc.).
- **Browser test**: Playwright spec under `ui/browser/`. Codifies a
  manual UI-verification process (rendering, layout, interaction) —
  not a true end-to-end suite (network is stubbed; state is injected
  into the store via `window.__test_store`). Uses the shared helpers
  in `ui/browser/helpers/inject.ts` (`waitForStore`, `resetStore`,
  `injectExchanges`, `getStoreState`).

## Acceptance bar for any task

`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test -- --run`
must pass. Coverage thresholds should rise toward the new floor; if a
task's batch raises a metric by ≥ 3 points, bump the threshold in
`vitest.config.ts` so we lock in the gain.

---

## P0 — Zero-coverage modules

### TASK-001 — `lib/utils.ts` formatters and matchers

- **Type**: pure-logic
- **Target**: `ui/src/lib/utils.ts`
- **Test file**: `ui/src/__tests__/lib.utils.test.ts`
- **Cases**:
  - `formatSize`: 0 → "0B"; 1 → "1B"; 1023 → "1023B"; 1024 →
    "1.0KB"; `1024 * 1024 - 1` → just under 1MB threshold;
    `1024 * 1024` → "1.0MB"; large value (e.g. `5.5 * 1024 * 1024`).
  - `statusClass`: `undefined` → "pending"; `"abc"` → "err";
    boundaries 199/200/299/300/399/400/499/500/599 → ok/redir/cli/srv.
  - `methodBadgeClass` and `methodTextClass`: every method
    (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS); lowercase input matches
    uppercase mapping; unknown method → fallback class.
  - `statusTextClass` and `statusChipClass`: 2xx → green; 3xx → amber;
    4xx/5xx → red; boundary at 200, 300, 400.
  - `traceColor`: same trace ID twice → identical color (deterministic);
    100 random IDs → all seven palette colors observed; empty string
    handled.
  - `formatTime`: ISO timestamp → `HH:MM:SS` string format (don't
    pin exact value — check it matches `/^\d{2}:\d{2}:\d{2}$/`).
    Invalid ISO → does not throw; produces "Invalid Date" or similar.
  - `matchesFilter`: empty filter → true; method substring (case
    insensitive); URI substring; status substring; no match → false;
    exchange with all undefined fields handled.
  - `splitUri`: `"/foo"` → `{path:"/foo", query:""}`;
    `"/foo?a=1"` → `{path:"/foo", query:"?a=1"}`;
    `""` → `{path:"", query:""}`; multiple `?` → split at first;
    `"/?a=1"` → `{path:"/", query:"?a=1"}`.
  - `parseQueryParams`: no `?` → `[]`; single param; multiple params;
    duplicate keys (records both); empty value (`?a=`); URL-encoded
    value (`?a=%20`).
  - `shortenTraceId`: length < 8 → returned as-is; length == 8 →
    truncated to `xxxx…xxxx`; length >> 8 → first 4 + ellipsis +
    last 4; empty string → empty string.
  - `isBulkOperation`: `undefined` → false; `null` → false; `/_msearch`
    → true; `/index/_msearch?refresh=true` → true; `/_mget` → true;
    `/api/users` → false.

### TASK-002 — `state/store.ts` actions and side effects

- **Type**: component-test environment (uses `window` / `localStorage`)
- **Target**: `ui/src/state/store.ts`
- **Test file**: `ui/src/__tests__/state.store.test.tsx` (jsdom
  project)
- **Cases**:
  - Factory: initial state matches expected defaults; `darkMode` is
    `false` at creation (bootstrap runs in `main.tsx`, not the store
    module).
  - `setSelectedId`, `setFilter`, `setTraceFilter`, `setHoverTraceId`,
    `setListMode`, `setOrder`, `setDensity`, `setCmdKOpen` — basic
    set-and-read.
  - `setListWidth("rows", 500)` — only updates `rows`, leaves `table`
    untouched.
  - `toggleTraceGroup` — flips.
  - `toggleDarkMode`:
    - flips `darkMode` state;
    - sets `document.documentElement` `data-theme` to `dark`/`light`;
    - writes `"dark"`/`"light"` to `localStorage` under `"theme"` key.
  - `applyEvent` — smoke test that it forwards to the reducer (deep
    coverage already lives in `state.reducer.test.ts`); inject a
    Request event and verify `ids` and `exchanges` populate.
  - `setConnection` / `setService` — basic.
- **Notes**: use `beforeEach` to reset the store snapshot via
  `useStore.setState(useStore.getInitialState())` and clear
  `localStorage` and the `data-theme` attribute.

### TASK-003 — `theme/applyTheme.ts`

- **Type**: pure-logic + component-test env
- **Target**: `ui/src/theme/applyTheme.ts`
- **Test file**: `ui/src/__tests__/theme.applyTheme.test.tsx` (jsdom)
- **Cases**:
  - `applyThemeToDOM(true)` → `data-theme="dark"`.
  - `applyThemeToDOM(false)` → `data-theme="light"`.
  - `resolveInitialDarkMode`:
    - `localStorage.theme = "dark"` → true (regardless of matchMedia).
    - `localStorage.theme = "light"` → false (regardless of matchMedia).
    - `localStorage.theme` missing, `matchMedia('(prefers-color-scheme: dark)')`
      → true → true.
    - same but matchMedia → false → false.
    - `localStorage.theme = "garbage"` → falls through to matchMedia
      (documents current behavior).
  - `persistDarkMode(true)` → `localStorage.theme === "dark"`.
  - `persistDarkMode(false)` → `localStorage.theme === "light"`.
- **Notes**: stub `matchMedia` with `vi.stubGlobal('matchMedia', ...)`.

### TASK-004 — `hooks/useDecodeBody.ts`

- **Type**: component (uses `useState`/`useEffect`)
- **Target**: `ui/src/hooks/useDecodeBody.ts`
- **Test file**: `ui/src/__tests__/useDecodeBody.test.tsx` (jsdom)
- **Cases** (use `renderHook` from `@testing-library/react`):
  - `body == null` → `{ loading: false, result: null }`.
  - `body.atEnd === false` (streaming) → `{ loading: false, result: null }`.
  - `body.atEnd === true` and decode resolves → first render shows
    `loading: true`, after the microtask flush shows `{ loading: false,
    result: <decoded> }`.
  - decode rejects → ultimately `{ loading: false, result: null }`.
  - body changes while a decode is in flight: the previous decode's
    result is dropped (cancellation flag); only the latest body's
    result is returned.
  - unmount mid-decode: no `act()` warning, no `setState` after
    unmount.
- **Notes**: mock `decodeBody` from `@ui/body/decode` with
  `vi.mock("@ui/body/decode")`.

---

## P1 — Gaps in already-tested modules

### TASK-020 — `state/reducer.ts` edge cases

- **Type**: pure-logic
- **Target**: `ui/src/state/reducer.ts`
- **Test file**: extend `ui/src/__tests__/state.reducer.test.ts`
- **Cases**:
  - `traceparent` parsing: well-formed `00-{32}-{16}-{2}` → traceId
    extracted. Wrong version byte (`01`) — document and assert current
    behavior. Missing fields (only two dashes). Lowercase / uppercase
    hex.
  - `getHeader` helper (extract into a separate test or use via a
    Request fixture): case-insensitive match; multiple headers with
    same name — document which one wins (first or last) and assert.
  - `BodyData` arriving with `content.offset` out of order: assert the
    documented behavior (probably append-in-arrival-order, but pin it).
  - `Response` event with no `elapsed_ms` field.
  - `Error` event after a fully completed exchange.

### TASK-021 — `body/sse.ts` field-parsing robustness

- **Type**: pure-logic
- **Test file**: extend `ui/src/__tests__/body.sse.test.ts`
- **Cases** (per the WHATWG SSE spec):
  - Field with colons in value: `"data: a:b:c"` → data field is
    `"a:b:c"`.
  - Lines without colon: treated as field with empty value.
  - Empty field name (`": comment"`) — comment, ignored.
  - Multiple consecutive `data:` lines concatenated with `\n`.
  - Anthropic event with `delta` missing `type` → skipped, no crash.
  - Anthropic event with no `message` field on `message_start` →
    handled, model/messageId remain undefined.

### TASK-022 — `api/sse.ts` lifecycle edges

- **Type**: pure-logic
- **Test file**: extend `ui/src/__tests__/api.sse.test.ts`
- **Cases**:
  - Multiple `onerror` firings — `"reconnecting"` emitted each time,
    no duplicate `EventSource` constructions.
  - Non-`exchange-report` event types arriving — ignored silently.
  - `cleanup()` called, then a delayed message fires — no callback to
    the consumer.

### TASK-023 — `body/decode.ts` edge cases

- **Type**: pure-logic
- **Test file**: extend `ui/src/__tests__/body.decode.test.ts`
- **Cases**:
  - `Content-Encoding: deflate` — body decoded.
  - `Content-Encoding: deflate-raw` — body decoded (or document the
    fall-through).
  - `Content-Type: application/json; charset=utf-8` — charset stripped
    from media-type display.
  - BOM (`﻿`) at start of UTF-8 body — stripped before JSON
    parsing.
  - Empty body (`totalBytes: 0`, chunks: []) — returns empty result,
    does not crash.
  - Malformed base64 in `payload.bytes` — `atob` throws; decode
    rejects gracefully.
  - Content-Type with multiple parameters (`charset` + `boundary`).

### TASK-024 — `CopyButton` interaction edges

- **Type**: component
- **Test file**: extend `ui/src/__tests__/CopyButton.test.tsx`
- **Cases**:
  - Rapid double-click: only one "Copied!" cycle, timer collapses.
  - `navigator.clipboard.writeText` rejects: assert documented
    behavior (currently: still shows "Copied!" — record the smell, mark
    XFAIL or `.todo` if the deferred refactor isn't yet landed).
  - Unmount while timer pending — no `act()` warning, no state update
    after unmount.
  - Keyboard activation (Enter / Space) triggers the same flow.

### TASK-025 — `api/info.ts` failure paths

- **Type**: pure-logic
- **Test file**: extend `ui/src/__tests__/api.info.test.ts`
- **Cases**:
  - `fetch` rejects (network error) — `fetchInfo` rejects with the
    underlying error.
  - 200 OK but `res.json()` throws — document current behavior
    (currently: throws unhelpfully) and mark a deferred refactor.
  - 404 / 500 — error message includes the status code.
  - Empty `services` array — does not crash; caller already handles.

### TASK-026 — `JsonViewer.tsx` tokenizer

- **Type**: pure-logic
- **Test file**: extend `ui/src/__tests__/json.viewer.test.ts`
- **Cases**:
  - Escaped quotes inside strings: `"\"foo\""`.
  - Escaped backslashes: `"\\"`.
  - Escaped control chars: `\n`, `\t`, `\r`.
  - Unicode escapes: `A` → A.
  - Scientific notation: `1e10`, `1.5e-3`, `-2.5E5`.
  - Brackets as standalone punctuation: `[`, `]`.
  - Multiple colons on a line (URL in a value).
  - Trailing whitespace preservation.

---

## P1 — Component tests (now enabled by jsdom + jest-dom)

Each component test focuses on the rendering and interaction surface,
not the underlying business logic (which lives in tested helpers).
Mount with `@testing-library/react`; query by role / text / test id;
assert with jest-dom matchers.

### TASK-030 — `ExchangeListItem`

- **Type**: component
- **Test file**: `ui/src/__tests__/ExchangeListItem.test.tsx`
- **Cases**:
  - Renders method badge with the expected class.
  - Renders status text with the expected color class for 2xx / 4xx /
    5xx.
  - Splits URI into path + query on the second row; query span only
    rendered when present.
  - `selected` prop applied → `aria-selected="true"` and the active
    background class.
  - Error exchange (no status, error set) → renders "ERR" text.
  - Density `"compact"` → reduced row padding class.

### TASK-031 — `FilterBar`

- **Type**: component
- **Test file**: `ui/src/__tests__/FilterBar.test.tsx`
- **Cases**:
  - Typing into the input dispatches `setFilter` with each keystroke.
  - Clear button visible iff filter is non-empty; click clears.
  - `traceFilter` chip renders when set; click clears via
    `setTraceFilter(null)`.
  - Count display: shows `N exchanges` when no filter; `M of N` when
    filtering.

### TASK-032 — `StatusBar`

- **Type**: component
- **Test file**: `ui/src/__tests__/StatusBar.test.tsx`
- **Cases**:
  - Connection `"connecting"` → amber pulsing dot + "connecting" text.
  - Connection `"open"` → green dot + "connected" text.
  - Connection `"reconnecting"` → distinct rendering (document).
  - Service name visible when set.
  - Exchange count visible.

### TASK-033 — `CommandPalette`

- **Type**: component
- **Test file**: `ui/src/__tests__/CommandPalette.test.tsx`
- **Cases**:
  - Hidden when `cmdKOpen === false`.
  - Visible when `cmdKOpen === true`; input focused.
  - Typing filters the exchange list (cmdk does the filtering;
    smoke-test that typed text narrows the rendered list).
  - Selecting an exchange row dispatches `setSelectedId` and closes
    the palette.
  - Toggling dark mode via the command dispatches `toggleDarkMode`.

---

## P2 — Browser-test coverage gaps

### TASK-040 — SSE reconnection visible in UI

- **Type**: browser
- **Test file**: `ui/browser/sse-reconnect.spec.ts` (new)
- **Setup**:
  - Use `page.route("/service/*/events", ...)` to return one response
    that aborts mid-stream, then a second that opens successfully.
- **Cases**:
  - Status pill transitions `connecting → open → reconnecting →
    open`.

### TASK-041 — Large body rendering

- **Test file**: extend `ui/browser/inspector.spec.ts` or new
  `ui/browser/body-large.spec.ts`
- **Setup**: inject an exchange whose response body is 2 MB of
  generated JSON.
- **Cases**:
  - Selecting the exchange shows the Bodies tab.
  - `JsonViewer` renders without script timeout (assert within the
    standard 30s).
  - Scrolling the viewer doesn't freeze.

### TASK-042 — Binary body

- **Test file**: `ui/browser/body-binary.spec.ts`
- **Setup**: inject a response with `Content-Type:
  application/octet-stream` and `payload.bytes` (base64) instead of
  text.
- **Cases**:
  - Bodies tab shows `Binary data · N B` placeholder.
  - No JsonViewer / pre block rendered.

### TASK-043 — Compressed body (gzip)

- **Test file**: `ui/browser/body-gzip.spec.ts`
- **Setup**: inject a response with `Content-Encoding: gzip` and a
  gzipped JSON payload (reuse the fixture from
  `body.decode.test.ts`).
- **Cases**:
  - Bodies tab eventually shows the decoded JSON content.

### TASK-044 — Multi-event Stream tab

- **Test file**: extend `ui/browser/inspector.spec.ts`
- **Setup**: inject an SSE exchange with N events (the existing
  `makeSSEResponse` only supplies one chunk; you'll need a variant
  builder).
- **Cases**:
  - Inspector switches to "Stream" tab.
  - N event rows render with correct event types.

### TASK-045 — Multi-filter intersection

- **Test file**: extend `ui/browser/filter.spec.ts`
- **Cases**:
  - Type a method substring AND set a trace filter — list shrinks to
    the intersection.
  - Clearing the trace filter expands back; the method filter still
    applies.

### TASK-046 — Resize boundaries

- **Test file**: extend `ui/browser/layout.spec.ts`
- **Cases**:
  - Drag the separator to the leftmost edge — list panel clamps at
    its `minSize`.
  - Drag to the rightmost edge — inspector clamps.
  - Switch from rows to table mode — `listWidth` for the new mode
    applies; switching back restores the previous width.

### TASK-047 — Service selection

- **Test file**: `ui/browser/service-select.spec.ts`
- **Setup**: mock `/info` to return two services.
- **Cases**:
  - First service is auto-selected on load.
  - Opening the service dropdown shows both; selecting the second
    fires a new subscription (assert via a second `page.route` hit
    counter).

### TASK-048 — localStorage persistence across reload

- **Test file**: `ui/browser/persistence.spec.ts`
- **Cases**:
  - Toggle dark mode → reload → still dark.
  - Toggle back → reload → light again.
  - If listWidth / density / order persistence is implemented:
    verify each. If not, file a follow-up rather than adding a failing
    test.

### TASK-049 — Relative timestamps update

- **Test file**: `ui/browser/timestamps.spec.ts`
- **Setup**: inject an exchange with a fixed timestamp; advance the
  page clock with `page.clock.fastForward()`.
- **Cases**:
  - "When" column updates from "now" → "5s" → "1m".

### TASK-050 — Accessibility smoke (soft-fail)

- **Test file**: `ui/browser/a11y.spec.ts`
- **Setup**: add `@axe-core/playwright` (`pnpm add -D
  @axe-core/playwright`).
- **Cases**:
  - Run an axe scan on the empty initial page — log violations, don't
    fail the build initially.
  - Run an axe scan with an exchange selected — log violations.
- **Promotion**: once known violations are triaged, switch to hard-fail.

---

## P2 — Browser-test de-flake

### TASK-060 — Remove `waitForTimeout(500)` in `layout.spec.ts`

- **Where**: `ui/browser/layout.spec.ts` (the virtual-scroll test around
  line 49 — currently waits 500ms then counts DOM nodes).
- **Fix**: replace with `expect.poll(() =>
  page.locator('[aria-selected]').count(), { timeout: 5000 })`
  asserting the count stabilises in the expected range.

### TASK-061 — Replace computed-style color assertions with class checks

- **Where**: `ui/browser/theme.spec.ts`, `ui/browser/exchange-list.spec.ts`
- **Fix**: instead of asserting `getComputedStyle(el).color` against
  a literal RGB string, assert
  `expect(el).toHaveClass(/text-(green|red|amber)/)`. jest-dom's
  `toHaveClass` is available now.

---

## Known issues / deferred refactors

These came up in the structural review but were deferred from the
test-enabling refactor pass. Decide per item whether to fix-before-test
or fix-in-follow-up.

### KI-001 — `api/sse.ts` lacks explicit reconnect backoff

- **State**: `EventSource` reconnects natively; the code emits
  `reconnecting` → `open` correctly. But there's no exponential
  backoff, no give-up after N failures, no `failed` status.
- **Recommendation**: write TASK-040 first with the current behavior
  pinned. If the browser-test demands an observable backoff signal, refactor
  then.

### KI-002 — `CopyButton.tsx` swallows clipboard rejection

- **State**: `void navigator.clipboard.writeText(text)` ignores
  promise rejection; button still shows "Copied!".
- **Recommendation**: fix before writing the rejection test
  (TASK-024) — otherwise the test pins a misleading behavior.

### KI-003 — `formatTime` hardcodes `en-US` locale

- **State**: `d.toLocaleTimeString("en-US", ...)`.
- **Recommendation**: switch to `undefined` (browser default) at the
  same time as TASK-001 — otherwise the test will need to mock the
  locale.

### KI-004 — Filter+order derivation duplicated

- **State**: `ExchangeList`, `Inspector`, and `CommandPalette` each
  re-derive `filtered + ordered` from the store.
- **Recommendation**: extract `useFilteredOrderedExchanges` once a
  third call site changes shape. Defer.

### KI-005 — `api/info.ts` doesn't catch JSON parse errors

- **State**: `res.json()` can throw an unhelpful "Unexpected token"
  error.
- **Recommendation**: two-line fix; defer to a follow-up commit
  alongside TASK-025.

### KI-006 — `window.__test_store` exposed in dev

- **State**: needed by the browser-test harness for state injection. Removing
  it requires re-architecting injection.
- **Recommendation**: leave alone. Tighten the typed surface only if
  the harness gets reshaped.

### KI-007 — Coverage thresholds are floor-level

- **State**: thresholds locked at v2 baseline minus margin
  (stmt 28 / branch 14 / fn 11 / line 31). Way below where v2 should
  ultimately sit.
- **Recommendation**: ratchet upward after each task batch lands.
