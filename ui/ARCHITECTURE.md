# UI Architecture

> Agent-facing deep architecture doc for the `ui/` subproject. Keep it in sync with the code **and** with the Architecture section of `ui/README.md` whenever the stack, data flow, or structure changes.

## Purpose & overview

`ui/` is the React + TypeScript frontend for protospy, an HTTP monitoring proxy. The protospy backend transparently proxies traffic for one or more configured services and reports each request/response as a stream of events. This UI connects to the backend, consumes that event stream over Server-Sent Events (SSE), reassembles the events into request/response **exchanges** in a Zustand store, and renders them in an interactive inspector: a virtualized list of exchanges on the left, and a detail pane (bodies, headers, timing, SSE/chat stream views) on the right.

The app is read-only with respect to traffic — it observes and inspects, it does not replay or modify requests. All interactivity (filtering, ordering, selection, theming, layout) is local UI state.

## Libraries & tools

Verified against `ui/package.json`.

### Runtime dependencies

| Library                                                    | Version (caret) | Role                                                                                                                           |
| ---------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `react` / `react-dom`                                      | 19              | UI framework. Rendered via `createRoot` in `StrictMode`.                                                                       |
| `zustand`                                                  | 5               | Single global store (`state/store.ts`) holding exchanges + UI state.                                                           |
| `@tanstack/react-virtual`                                  | 3               | Virtualized rendering for the exchange list and the JSON viewer (only visible rows are in the DOM).                            |
| `radix-ui`                                                 | 1.4             | Unstyled accessible primitives (dialog, popover, tabs, tooltip, dropdown, separator, scroll-area) wrapped by `components/ui/`. |
| `cmdk`                                                     | 1               | Command-palette primitive (⌘K), wrapped by `components/ui/command.tsx` and used by `CommandPalette`.                           |
| `react-resizable-panels`                                   | 4               | The resizable left-list / right-inspector split in `AppShell`.                                                                 |
| `lucide-react`                                             | 1               | Icon set.                                                                                                                      |
| `class-variance-authority`, `clsx`, `tailwind-merge`       | —               | Class composition. `cn()` in `lib/utils.ts` = `twMerge(clsx(...))`.                                                            |
| `@fontsource-variable/inter`, `@fontsource/jetbrains-mono` | 5               | Self-hosted UI and mono fonts, imported in `main.tsx`.                                                                         |

### Tooling / dev dependencies

| Tool                                                                                                    | Role                                                                                                         |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Vite** 8 (`@vitejs/plugin-react`)                                                                     | Dev server (HMR), production build, path aliases, dev proxy to the backend.                                  |
| **TypeScript** 6                                                                                        | `strict`, `noUnusedLocals/Parameters`, bundler module resolution; `tsc --noEmit` for `pnpm typecheck`.       |
| **Tailwind CSS v4** (`@tailwindcss/vite`, `tailwindcss`)                                                | Styling via the Vite plugin (no `tailwind.config.js`); tokens defined in `theme/tailwind.css` with `@theme`. |
| **Vitest** 4 (`@vitest/coverage-v8`)                                                                    | Unit (node) + component (jsdom) tests.                                                                       |
| **Playwright** (`@playwright/test`, `@axe-core/playwright`)                                             | Browser tests under `browser/`, plus an axe a11y scan.                                                       |
| `@testing-library/react`, `@testing-library/jest-dom`                                                   | Component-test rendering + DOM matchers (jsdom project).                                                     |
| **ESLint** 9 (`typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks` 7) + **Prettier** | Lint and format.                                                                                             |
| **pnpm** 10                                                                                             | Package manager (Node 22+).                                                                                  |

**React Compiler is NOT run here.** `@vitejs/plugin-react` is configured without `babel-plugin-react-compiler`, so there is no build-time memoization transform. However, `eslint-plugin-react-hooks@7` bundles the compiler's static checks, so its diagnostics (e.g. `react-hooks/incompatible-library` on `useVirtualizer`) still surface during `pnpm lint`. Those specific warnings are suppressed at the call sites with explanatory comments; revisit if the compiler is ever adopted. See the README's React Compiler note.

## General design / data flow

This is the key section. End to end:

### 1. Bootstrap (`main.tsx` → `App.tsx` → `AppShell`)

`index.html` has an inline pre-React IIFE that reads the persisted theme preference from `localStorage` (`protospy-ui-prefs`), resolves `'system'` via `matchMedia`, and sets `<html data-theme>` synchronously so the first paint is already themed. `main.tsx` then renders `<App/>` (which is just `<AppShell/>`) into `#root`. The store's `subscribeWithSelector` subscription on the `theme` slice (with `fireImmediately: true`) reconciles store→DOM once on load and on every subsequent theme change — it is the **sole runtime DOM writer**. See the theme ownership contract in `theme/applyTheme.ts`.

### 2. Backend discovery + subscription (`api/` + `AppShell`)

`AppShell` runs two effects:

- **Effect A** calls `fetchInfo()` once on mount. `fetchInfo` (`api/info.ts`) `GET`s `/info` and returns `{ started_at, services: Service[] }` (typed from `@bindings/Info`). It picks `services[0]`, stores its `name` (`setService`) and `protocol` (`setProtocol`). The protocol (`"Elasticsearch" | "OpenSearch" | "Anthropic" | null`) drives protocol-specific views downstream.
- **Effect B** runs whenever `service` changes and calls `subscribeToEvents(service, onMessage, onStatusChange)` (`api/sse.ts`). That opens an `EventSource` at `/service/<name>/events`, reports `ConnectionStatus` (`"connecting" | "open" | "reconnecting"`) via `onStatusChange`, and listens for `"exchange-report"` named events. Each event's `.data` is `JSON.parse`d into an `EventMessage` and passed to `onMessage`, which calls `applyEvent(msg)`. The returned cleanup closes the `EventSource`. Switching services tears down and re-subscribes. `EventSource` handles reconnection natively (errors flip status to `"reconnecting"`). On open/error, `subscribeToEvents` also calls `globalThis.parent?.postMessage({ type: "proxy_connected" | "proxy_disconnected" }, "*")` so an embedding parent frame can observe connection state.

In dev, Vite proxies `/info` and `/service/*` to `http://localhost:3100` (see `vite.config.ts`).

### 3. `EventMessage` shape (`@bindings/`)

`EventMessage` (generated from the Rust backend via ts-rs) is:

```ts
type EventMessage = {
  exchange: ExchangeMeta;
  direction: Direction;
  event: Event;
};
type ExchangeMeta = { exchange_id: number; timestamp: string };
type Direction = "Request" | "Response";
type Event =
  | {
      type: "Request";
      method;
      uri;
      version;
      headers: ProxyHeaders;
      body: InitialBody;
    }
  | {
      type: "Response";
      status;
      version;
      headers: ProxyHeaders;
      elapsed_ms;
      body: InitialBody;
    }
  | ({ type: "BodyData" } & BodyData)
  | { type: "Error"; direction: Direction; message: string };
```

`ProxyHeaders` is `Array<{ name; value }>`. `InitialBody` is `NoBody | NotRead | (Data & BodyData)`; `BodyData` carries `content: BodyContent | null` (with a `payload: BodyChunk`), `trailers`, `at_end`, `total_bytes`. A `BodyChunk` is either `{ text: string }` or `{ binary: string }` (base64). The backend may deliver a body inline on the `Request`/`Response` event (`InitialBody`) and/or stream it across subsequent `BodyData` events.

### 4. Store as reducer (`state/`)

`state/store.ts` defines the single Zustand store. The only domain action is `applyEvent(msg)`, which copies `exchanges` (a `Map<number, Exchange>`) and `ids` (insertion-ordered `number[]`), then delegates to the **pure reducer** `apply(exchanges, ids, msg)` in `state/reducer.ts`. Keeping `apply` pure makes it unit-testable in the node project without React or the store.

`apply` upserts the `Exchange` keyed by `meta.exchange_id` (pushing new ids onto `ids`) and merges by event type. It updates **immutably**: each matched event shallow-copies the prior `Exchange` (seeding a fresh one if absent), applies the event's fields to the copy, and stores the new object — so object identity changes on every update rather than the prior in-place mutation. `BodyData` likewise produces a new `BodyState` (and a new `chunks` array when a payload is appended; the unchanged array is shared when an event carries no payload). This matches the store's `setBodyDecodedBytes` action and lets identity-based memoization (e.g. `React.memo`, or the `StreamView`/`ChatStreamView` `useMemo` keyed on `body`) track streaming updates instead of silently missing them. The merges by event type:

- **`Request`** → sets `method/uri/version/requestHeaders/requestBody`. Also derives `traceId` from the `traceparent` header (the second `-`-delimited segment).
- **`Response`** → sets `status/responseVersion/responseHeaders/elapsedMs/responseBody`.
- **`BodyData`** → appends the chunk payload to `requestBody`/`responseBody` (chosen by `msg.direction`), updating `atEnd` and `wireBytes`.
- **`Error`** → records `{ direction, message }`.

`InitialBody` is normalized to the local `BodyState` (`{ chunks, atEnd, wireBytes, contentType?, contentEncoding? }`) by `initialBodyToState`, which pulls `content-type`/`content-encoding` off the headers at reduce time so decoders don't have to re-scan headers. `NoBody` → `undefined`; `NotRead` → empty-but-present body.

The store also holds all **UI state**: `selectedId`, `filter`, `traceFilter`, `hoverTraceId`, `listMode` (`rows`/`table`), `listWidth`, `order` (`newest`/`oldest`), `density`, `traceGroupOn`, `cmdKOpen`, `theme` (`'light' | 'dark' | 'system'`), plus `connection`, `service`, `protocol`. Each has a plain setter. `setTheme` only updates store state — the sole runtime DOM writer is a `subscribeWithSelector` subscription on the `theme` slice (see the ownership contract in `theme/applyTheme.ts`). The store uses Zustand's `persist` middleware (wrapped in `subscribeWithSelector`) to save UI preferences (`listWidth`, `density`, `order`, `listMode`, `traceGroupOn`, `theme`) to `localStorage` under the key `protospy-ui-prefs`, with `partialize` to exclude transient state. The persist `version` is 1; version 0→1 migrates the old `darkMode: boolean` to the three-state `theme` enum.

### 5. Render (`components/`)

Components subscribe to slices of the store with selectors (`useStore((s) => s.x)`). The render tree:

- `AppShell` — `TopBar` / `FilterBar` / resizable [`ExchangeList` | `Inspector`] / `StatusBar` / `CommandPalette`. The resizable divider between list and inspector supports double-click to reset the list pane to its default width for the current `listMode`.
- `ExchangeList` derives the visible list each render: map `ids` → exchanges, filter via `matchesFilter`, reverse for `newest`. It renders rows through `@tanstack/react-virtual` (only visible rows in DOM) in either `rows` mode (`ExchangeListItem`) or `table` mode (inline `TableRow`). Row timestamps are displayed as live relative times via `useRelativeTime`. It also owns global keyboard nav (`j`/`k`/arrows to move selection, ⌘K to toggle the palette).
- `Inspector` resolves the selected exchange and renders a `ContextBar` plus tabs: Bodies/Stream, optional Pairs (Elasticsearch/OpenSearch bulk ops, gated by `protocol/showPairsTab`), a unified **Headers** tab (request and response headers side-by-side via `HeadersSplit`), and Timing. `BodySplit` shows request vs. response panes; for `text/event-stream` responses it picks `ChatStreamView` (Anthropic protocol) or the generic `StreamView`. `StreamView` uses `LiveIndicator` for a three-state (live / paused / complete) stream status badge.
- `CommandPalette` (⌘K) provides commands only — dark mode toggle, list mode, order, density. It no longer lists individual exchanges.

### 6. Body decoding (`body/` + `hooks/`)

Rendering a body never touches raw chunks directly — it goes through the decode pipeline:

- `BodyPane` calls `useDecodeBody(body)` (`hooks/useDecodeBody.ts`). The hook only decodes once `body.atEnd` is true (a streaming body shows nothing until complete), runs `decodeBody` async in an effect, guards against stale results via a `cancelled` flag and a `body`-identity check, and returns `{ loading, result }`.
- `decodeBody` (`body/decode.ts`) is the pure async pipeline: concatenate chunks to bytes (`text` chunks UTF-8-encoded, `binary` chunks base64-decoded) → decompress: `gzip`/`deflate` via the browser `DecompressionStream`; `br` (brotli) via `brotli-dec-wasm` (~200 KB WASM, lazy-loaded on first use via a module-level singleton); `zstd` via `@bokuweb/zstd-wasm` (~248 KB WASM, same lazy singleton pattern, `"node"` exports condition used by Vitest so no Node wrapper needed) → `TextDecoder` to text → classify into `kind`: `jsonl` (ndjson MIME types — checked **before** JSON because they contain "json"), `json` (pretty-printed), `binary` (image/audio/video/octet-stream), or `text`. Returns `{ kind, text?, mediaType, size }`.
- `JsonViewer` renders pretty JSON with a tiny line tokenizer and virtualizes the lines (20px rows).
- SSE bodies use `body/sse.ts`: `chunksToText` reassembles chunk bytes to a string; `parseSSEBody(text)` splits on blank lines and parses `event:`/`data:`/`id:` fields into `SSEEvent[]` (`{ type, data, id?, parsedData?, index }`), attempting `JSON.parse` of the data. `StreamView`/`ChatStreamView` consume that. For Anthropic, `anthropic/transcript.ts` `extractAnthropicTranscript(events)` folds the SSE event sequence (`message_start`, `content_block_delta` text deltas, `message_delta`, `message_stop`) into `{ text, model, messageId, stopReason, usage, isComplete }`.

### Path aliases

- `@bindings/*` → `../bindings/*` — TypeScript types **generated from the Rust backend** by ts-rs (do not edit; they're regenerated). Defined in `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`.
- `@ui/*` → `./src/*` — internal imports.

## Architectural patterns

- **Store-as-reducer.** The domain mutation lives in a pure function (`apply`) that the store action (`applyEvent`) wraps with copy-on-write. The pure core is testable without React; the store is a thin shell over it.
- **Pure helpers over hooks.** Formatting, classification, URI parsing, filtering, trace coloring, header masking/sorting, and SSE event badge classification live as pure functions in `lib/utils.ts`; theming logic (DOM mutation, persistence, initial resolution) lives in `theme/applyTheme.ts`. These are unit-tested directly. Components stay thin.
- **Shared tick source.** `lib/tickSource.ts` is a module-level singleton that fires a 1 Hz interval only while there are subscribers. `useRelativeTime` subscribes to it to drive live relative-time displays without each component owning its own `setInterval`.
- **Derive, don't store, the visible list.** `selectedId`/`filter`/`order` are stored; the filtered+ordered exchange array is recomputed each render in both `ExchangeList` and `Inspector` (they intentionally mirror the same derivation).
- **Virtualized lists.** `@tanstack/react-virtual` backs both the exchange list and the JSON viewer; the `react-hooks/incompatible-library` lint suppressions are intentional (see Libraries note).
- **shadcn/ui primitives.** `components/ui/` holds shadcn-generated Radix/cmdk wrappers (`components.json`, new-york style, lucide icons). Treat them as vendored primitives; app-specific composition lives in `components/`. Coverage and some lint conventions treat `components/ui/**` as generated.
- **Theming via Tailwind tokens.** `theme/tailwind.css` defines semantic color tokens under `@theme`, with a `dark` custom variant bound to `[data-theme=dark]`. The theme preference is a three-state enum (`'light' | 'dark' | 'system'`); `'system'` follows the OS via `matchMedia`. There are exactly two writers of `<html data-theme>`: the bootstrap IIFE in `index.html` (first paint) and the `subscribeWithSelector` subscription in `store.ts` (runtime). No other code path touches the attribute. Components reference token classes (`bg-bg`, `text-ink`, `text-m-get`, …) rather than raw colors. A separate `@theme inline` block aliases shadcn's standard semantic tokens (`--color-primary`, `--color-ring`, `--color-muted-foreground`, etc.) onto the protospy palette so vendored `components/ui/*` primitives resolve those utilities without per-call-site overrides; `@theme inline` is required because the values are `var()` references. A `@layer base` rule sets the default `border-color` to `var(--color-border)` (Tailwind v4 preflight uses `currentColor`).
- **Test-harness hooks (`window.__test_store` / `window.__test_scenes`).** Both are exposed when `import.meta.env.DEV` **or** `import.meta.env.VITE_EXPOSE_TEST_HOOKS === "true"`. The flag comes from `.env.test`, loaded by `pnpm build:test` (`vite build --mode test`) — the build the Playwright suite serves via `vite preview` (see "Testing" below). A plain `pnpm build` sets neither, so both hooks are tree-shaken / dead-code-eliminated from production bundles. `state/store.ts` exposes the store on `window.__test_store`; this is **load-bearing** for the Playwright harness (`browser/helpers/inject.ts` drives `applyEvent`/`getState`/`setState` through it). Do not remove it.
- **Fixture matrix (`window.__test_scenes`).** `src/test/scenes.ts` defines `SCENES` — a deterministic, injectable matrix of UI states (empty/loading/error/selected, long URI/status/error, many rows, dual wire/decoded size, rows vs table, compact vs regular) used by the visual-review workflow (PRO-229/PRO-235). `main.tsx` installs the `window.__test_scenes` harness (`list`/`apply`/`widths`) under the same gate as `__test_store`, via a dynamic import that is dead-code-eliminated from production. `applySceneToStore` is the pure applier shared by the harness and `browser/fixture-matrix.spec.ts`. The list-pane width axis is an interaction (`dragListPaneTo` in `browser/helpers/scenes.ts`), not store state. See [`docs/fixture-matrix.md`](./docs/fixture-matrix.md).

## High-level structure / file map

```
ui/
  src/
    api/            # Backend access. info.ts (fetchInfo, /info, Info type); sse.ts (subscribeToEvents, EventSource, ConnectionStatus; emits postMessage to parent on connect/disconnect)
    body/           # Pure body decoding. decode.ts (chunks→bytes→decompress→classify json/jsonl/text/binary); sse.ts (parseSSEBody, chunksToText)
    anthropic/      # transcript.ts — folds an SSE event stream into an Anthropic chat transcript summary
    state/          # store.ts (Zustand store + persist middleware + UI state + dev __test_store); reducer.ts (pure apply(), Exchange/BodyState shapes)
    protocol/       # index.ts — protocol-aware UI gating; showPairsTab() (ES/OpenSearch bulk ops only)
    hooks/          # useDecodeBody.ts — async decode-on-complete hook used by BodyPane; useRelativeTime.ts — live relative-time display backed by tickSource
    lib/            # utils.ts — pure helpers: cn, formatSize, status/method class mappers, traceColor, formatTime, formatRelative, matchesFilter, splitUri, parseQueryParams, shortenTraceId, isBulkOperation, eventTypeBadgeClass, maskHeaderValue, decodeBasicAuth, filterHeaders, sortHeadersByPin, PINNED_HEADER_NAMES
                    # tickSource.ts — shared 1 Hz singleton interval (subscribe/unsubscribe); starts/stops automatically with subscriber count
    theme/          # tailwind.css (@theme tokens + dark variant + @theme inline shadcn aliases + @layer base border-color); applyTheme.ts (applyThemeToDOM)
    components/     # App components (AppShell, TopBar, FilterBar, ExchangeList, ExchangeListItem, Inspector, ContextBar, BodySplit, BodyPane, StreamView, LiveIndicator, HeadersSplit, HeadersPane, JsonViewer, TimingView, StatusBar, CommandPalette, CopyButton)
      ui/           # shadcn/ui primitives (Radix/cmdk wrappers): button, dialog, popover, tabs, tooltip, dropdown-menu, command, scroll-area, separator + EmptyState, MethodBadge
      anthropic/    # ChatStreamView.tsx — Anthropic SSE/chat-transcript renderer
    test/           # setup.ts (jest-dom for jsdom project); fixtures.ts (shared EventMessage builders); scenes.ts (fixture matrix + window.__test_scenes harness)
    __tests__/      # Vitest tests — *.test.ts (node) and *.test.tsx (jsdom)
    App.tsx         # Root component (renders AppShell)
    main.tsx        # Entry point — fonts + early dark-mode bootstrap from persist key + dev-only __test_scenes install + createRoot render
    vite-env.d.ts   # Vite ambient types
  docs/             # fixture-matrix.md — the injectable state matrix and how to reach each cell
  browser/          # Playwright specs (*.spec.ts, incl. fixture-matrix.spec.ts) + fixtures/exchanges.ts (re-export of src/test/fixtures.ts) + helpers/inject.ts, helpers/scenes.ts
  index.html        # HTML shell; inline pre-React theme script; mounts /src/main.tsx
  vite.config.ts    # Vite: react + tailwind plugins, @bindings/@ui aliases, dev proxy to :3100
  vitest.config.ts  # Vitest: node + jsdom projects, coverage include/exclude + thresholds
  playwright.config.ts # Playwright: ./browser, chromium, path-hashed port, serves `pnpm build:test && pnpm preview` as webServer
  tsconfig.json     # App TS config (strict, bundler resolution, path aliases)
  tsconfig.node.json# TS config for config files (vite/vitest/playwright)
  eslint.config.js  # Flat config: js + ts-eslint + react + react-hooks + prettier
  components.json   # shadcn/ui config (style new-york, aliases, lucide)
```

The `@bindings` directory lives at `../bindings/` (repo root), not under `ui/`.

## Testing architecture

Brief overview; the deep detail (patterns, fixtures, coverage policy, browser-test gotchas) is in **`ui/CLAUDE.md`** — read it before writing tests.

Three tiers, with Vitest auto-selecting its project by file extension:

| Tier      | Files                      | Project / runner | Environment                                                             |
| --------- | -------------------------- | ---------------- | ----------------------------------------------------------------------- |
| Unit      | `src/__tests__/*.test.ts`  | Vitest `node`    | node — pure functions: reducer, decoders, parsers, formatters           |
| Component | `src/__tests__/*.test.tsx` | Vitest `jsdom`   | jsdom — React components + hooks; jest-dom matchers via `test/setup.ts` |
| Browser   | `browser/*.spec.ts`        | Playwright       | chromium — rendering/layout/interaction through the real DOM + store    |

The browser suite is **not** full-stack e2e: it injects `EventMessage`s straight into the store via `window.__test_store` (`browser/helpers/inject.ts`) and stubs `/info` and `/service/.../events` with `page.route`, so the real `EventSource` path is not exercised. Shared `EventMessage` fixtures live in `src/test/fixtures.ts` and are re-exported to `browser/fixtures/exchanges.ts`. Coverage thresholds are floored in `vitest.config.ts` (ratchet up, never down); `components/ui/**`, `theme/**`, `main.tsx`/`App.tsx`, and the test dirs are excluded.

`browser/a11y.spec.ts` runs an `@axe-core/playwright` axe scan on both the empty page and with an exchange selected. The scan is **advisory, not a gate** — a11y is low priority for protospy (no screen-reader target), so violations never fail the test or block merge. They surface as `console.warn` lines in the output and are recorded as `testInfo.annotations` (HTML report) and attached as JSON for triage. The scan keeps the full WCAG tag set, so keyboard/focus rules still run — keyboard/focus quality remains the a11y bar.
