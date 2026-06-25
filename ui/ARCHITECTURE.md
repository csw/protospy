# UI Architecture

> Agent-facing deep architecture doc for the `ui/` subproject. Keep it in sync with the code **and** with the Architecture section of `ui/README.md` whenever the stack, data flow, or structure changes.

## Purpose & overview

`ui/` is the React + TypeScript frontend for protospy, an HTTP monitoring proxy. The protospy backend transparently proxies traffic for one or more configured services and reports each request/response as a stream of events. This UI connects to the backend, consumes that event stream over Server-Sent Events (SSE), reassembles the events into request/response **exchanges** in a Zustand store, and renders them in an interactive inspector: a virtualized list of exchanges on the left, and a detail pane (bodies, headers, timing, SSE/chat stream views) on the right.

The app is read-only with respect to traffic — it observes and inspects, it does not replay or modify requests. All interactivity (filtering, ordering, selection, theming, layout) is local UI state.

## Libraries & tools

Verified against `ui/package.json`.

### Runtime dependencies

| Library                                                    | Version (caret) | Role                                                                                                                     |
| ---------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `react` / `react-dom`                                      | 19              | UI framework. Rendered via `createRoot` in `StrictMode`.                                                                 |
| `zustand`                                                  | 5               | Single global store (`state/store.ts`) holding exchanges + UI state.                                                     |
| `@tanstack/react-virtual`                                  | 3               | Virtualized rendering for the exchange list, the SSE event list, and the JSON viewer (only visible rows are in the DOM). |
| `radix-ui`                                                 | 1.4             | Unstyled accessible primitives (dialog, tabs, tooltip, dropdown) wrapped by `components/ui/`.                            |
| `cmdk`                                                     | 1               | Command-palette primitive (⌘K), wrapped by `components/ui/command.tsx` and used by `CommandPalette`.                     |
| `react-resizable-panels`                                   | 4               | The resizable left-list / right-inspector split in `AppShell`.                                                           |
| `lucide-react`                                             | 1               | Icon set.                                                                                                                |
| `class-variance-authority`, `clsx`, `tailwind-merge`       | —               | Class composition. `cn()` in `lib/utils.ts` = `twMerge(clsx(...))`.                                                      |
| `@fontsource-variable/inter`, `@fontsource/jetbrains-mono` | 5               | Self-hosted UI and mono fonts, imported in `main.tsx`.                                                                   |
| `prismjs`                                                  | 1               | Syntax highlighter (`markup` grammar) for the HTML/XML formatted view; used only in the markup Worker.                   |
| `xml-formatter`, `js-beautify`                             | 3 / 1           | Pure-JS pretty-printers (re-indent) for XML and HTML respectively, run in the markup Worker.                             |

### Tooling / dev dependencies

| Tool                                                                                                    | Role                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Vite** 8 (`@vitejs/plugin-react`)                                                                     | Dev server (HMR), production build, path aliases, dev proxy to the backend.                                                        |
| **TypeScript** 6                                                                                        | `strict`, `noUnusedLocals/Parameters`, bundler module resolution; `tsc --noEmit` for `pnpm typecheck`.                             |
| **Tailwind CSS v4** (`@tailwindcss/vite`, `tailwindcss`)                                                | Styling via the Vite plugin (no `tailwind.config.js`); tokens defined in `app/globals.css` with `@theme inline` + `:root`/`.dark`. |
| **next-themes** (`next-themes`)                                                                         | Owns the theme: `.dark` class on `<html>` (class strategy), persisted under the `theme` localStorage key.                          |
| **Vitest** 4 (`@vitest/coverage-v8`)                                                                    | Unit (node) + component (jsdom) tests.                                                                                             |
| **Playwright** (`@playwright/test`, `@axe-core/playwright`)                                             | Browser tests under `browser/`, plus an axe a11y scan.                                                                             |
| `@testing-library/react`, `@testing-library/jest-dom`                                                   | Component-test rendering + DOM matchers (jsdom project).                                                                           |
| **ESLint** 9 (`typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks` 7) + **Prettier** | Lint and format.                                                                                                                   |
| **pnpm** 10                                                                                             | Package manager (Node 22+).                                                                                                        |

**React Compiler is NOT run here.** `@vitejs/plugin-react` is configured without `babel-plugin-react-compiler`, so there is no build-time memoization transform. However, `eslint-plugin-react-hooks@7` bundles the compiler's static checks, so its diagnostics (e.g. `react-hooks/incompatible-library` on `useVirtualizer`) still surface during `pnpm lint`. Those specific warnings are suppressed at the call sites with explanatory comments; revisit if the compiler is ever adopted. See the README's React Compiler note.

## General design / data flow

This is the key section. End to end:

### 1. Bootstrap (`main.tsx` → `App.tsx` → `AppShell`)

`index.html` has an inline pre-React IIFE that reads the persisted theme preference from `localStorage` (the next-themes `theme` key — a plain `'light' | 'dark' | 'system'` string), resolves `'system'` via `matchMedia`, and toggles the `.dark` class on `<html>` synchronously so the first paint is already themed. `main.tsx` imports `app/globals.css` and renders `<App/>` into `#root`. `<App/>` is a next-themes `ThemeProvider` (`attribute="class"`, `storageKey="theme"`, `defaultTheme={resolveDefaultTheme()}`, `enableSystem`, `disableTransitionOnChange`) wrapping `<AppShell/>` — **next-themes is the sole runtime writer of the theme class** on `<html>`. Theme no longer lives in the Zustand store; what the store's `subscribeWithSelector` subscription (with `fireImmediately: true`) reconciles to the DOM is the **`density` slice** → `<html data-density>` (the density-ownership contract in `state/store.ts`). A dev/test-only `ThemeTestBridge` exposes next-themes' control on `window.__test_theme` for the Playwright harness and component tests.

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

`apply` upserts the `Exchange` keyed by `meta.exchange_id` (pushing new ids onto `ids`) and merges by event type. It updates **immutably**: each matched event shallow-copies the prior `Exchange` (seeding a fresh one if absent), applies the event's fields to the copy, and stores the new object — so object identity changes on every update rather than the prior in-place mutation. `BodyData` likewise produces a new `BodyState` (and a new `chunks` array when a payload is appended; the unchanged array is shared when an event carries no payload). This matches the store's `setBodyDecodedBytes` action and lets identity-based memoization (e.g. `React.memo`, or `ChatStreamView`'s `useMemo` keyed on the event list) track streaming updates instead of silently missing them. The merges by event type:

- **`Request`** → sets `method/uri/version/requestHeaders/requestBody`. Also derives `traceId` from the `traceparent` header (the second `-`-delimited segment).
- **`Response`** → sets `status/responseVersion/responseHeaders/elapsedMs/responseBody`.
- **`BodyData`** → appends the chunk payload to `requestBody`/`responseBody` (chosen by `msg.direction`), updating `atEnd` and `wireBytes`.
- **`Error`** → records `{ direction, message }`.

`InitialBody` is normalized to the local `BodyState` (`{ chunks, atEnd, wireBytes, contentType?, contentEncoding? }`) by `initialBodyToState`, which pulls `content-type`/`content-encoding` off the headers at reduce time so decoders don't have to re-scan headers. `NoBody` → `undefined`; `NotRead` → empty-but-present body.

**Eviction (PRO-97).** After each `apply`, `applyEvent` calls `evict(exchanges, ids, selectedId)` (also pure, in `state/reducer.ts`) to keep the store within two hard caps: **`MAX_EXCHANGES` = 1024** exchanges and **`MAX_PAYLOAD_BYTES` = 512 MB** of body payload. Over either cap, eviction drops exchanges oldest-first (front of `ids`) until both hold, so a long session can't grow the store unboundedly. Payload is accounted from each body's `wireBytes` (the compressed/wire size the store actually retains as `chunks`) summed over request + response — a close-enough guardrail, not exact byte accounting; the decompressed copy is produced on demand and held only while an exchange is selected, so it is deliberately not counted. The **currently selected** exchange (`selectedId`) is never evicted, so inspecting an old exchange doesn't make it vanish; eviction also always leaves at least one exchange. Eviction runs on every event (not only new-exchange ones) because a streaming body's `wireBytes` grows via `BodyData`, which can cross the payload cap without a new exchange. There is no UI affordance for eviction — evicted exchanges simply drop out of the `ids`-derived list. Configurable/persistent caps and proxy-side or SSE/activity-aware retention are out of scope here (epic PRO-155).

The store also holds all **UI state**: `selectedId`, `filter`, `traceFilter`, `hoverTraceId`, `listMode` (`rows`/`table`, default `rows`), `listWidth`, `order` (`newest`/`oldest`), `density`, `traceGroupOn`, `cmdKOpen`, `timeZone` (`'local' | 'utc'`), plus `connection`, `service`, `protocol`. Each has a plain setter. `listWidth` stores the v2.4 scaffold panel pixel widths per mode (`rows`/`table`); the shell may cap the first-render applied width on narrow viewports, but that cap is not persisted unless the divider is manually dragged. Theme is **not** in the store — next-themes owns it under its own `theme` localStorage key (see Bootstrap above). `density` is the slice with a DOM side effect: a `subscribeWithSelector` subscription (the sole runtime writer of `<html data-density>`) reconciles it on load and on every change. The store uses Zustand's `persist` middleware (wrapped in `subscribeWithSelector`) to save UI preferences (`listWidth`, `density`, `order`, `listMode`, `traceGroupOn`, `timeZone`) to `localStorage` under the key `protospy-ui-prefs`, with `partialize` to exclude transient state. The persist `version` is 1.

### 5. Render (`components/`)

Components subscribe to slices of the store with selectors (`useStore((s) => s.x)`). The render tree:

- `components/AppShell` (`app-shell.tsx`) — live v2.4 outer shell: `TopBar` / `FilterBar` / resizable [`ListPanel` | `InspectorPanel`] / `StatusBar` / `CommandPalette` / `ShortcutsOverlay`. The resizable divider uses scaffold pixel sizing, preserves the list pane's pixel width across viewport resizes, and persists `listWidth` per `listMode` only from manual divider movement.
- `ListPanel` derives the visible list each render through store selectors, then renders either grouped traces (`GroupedExchangeList`), table mode (`ExchangeTable`), or rows mode (`ExchangeRow`). Rows mode is the default. `AppShell` owns global keyboard nav (`j`/`k`/arrows to move selection, ⌘K to toggle the palette, `/` to focus filter, `?` help).
- `Inspector` resolves the selected exchange and renders a `ContextBar` plus tabs: Bodies/Stream, optional Pairs (Elasticsearch/OpenSearch bulk ops, gated by `protocol/showPairsTab`), a unified **Headers** tab (request and response headers side-by-side via `HeadersSplit`), and Timing. `BodySplit` shows request vs. response panes; for `text/event-stream` responses it picks `ChatStreamView` (Anthropic protocol) or the generic v2.3 `stream-view.tsx`, **keyed on `exchange.id`** so per-exchange view state (the stream's play/pause snapshot) resets when the selection changes. The generic `StreamView` renders the v2.3 scaffold presentation — a four-state (live / paused / disconnected / complete) inline live indicator from `deriveStreamState`, plus play/pause — while `ChatStreamView` still uses the `LiveIndicator` component for the same four states.
- `CommandPalette` (⌘K) provides commands only — dark mode toggle, list mode, order, density, time zone. It no longer lists individual exchanges.

### 6. Body decoding (`body/` + `hooks/`)

Rendering a body never touches raw chunks directly — it goes through the decode pipeline:

- `BodyPane` calls `useDecodeBody(body)` (`hooks/useDecodeBody.ts`). The hook only decodes once `body.atEnd` is true (a streaming body shows nothing until complete), runs `decodeBody` async in an effect, guards against stale results via a `cancelled` flag and a `body`-identity check, and returns `{ loading, result }`.
- `decodeBody` (`body/decode.ts`) is the async pipeline: concatenate chunks to bytes (`text` chunks UTF-8-encoded, `binary` chunks base64-decoded) → decompress: `gzip`/`deflate` via the browser `DecompressionStream`; `br` (brotli) via `brotli-dec-wasm` (~200 KB WASM, lazy-loaded on first use via a module-level singleton); `zstd` via `@bokuweb/zstd-wasm` (~248 KB WASM, same lazy singleton pattern, `"node"` exports condition used by Vitest so no Node wrapper needed) → `TextDecoder` to text → classify into `kind`: `ndjson` (ndjson MIME types — checked **before** JSON because they contain "json"; parsed line-by-line into a forest of document trees), `json` (single document), `html`/`xml` (markup MIME types incl. the generic `application/*+xml` suffix), `image`, `binary` (audio/video/octet-stream), or `text`. `json`/`ndjson` and `html`/`xml` are each **offloaded to a Web Worker** (see below); `json`/`ndjson` tolerate a truncated tail. Returns `{ kind, text?, parsed?, documents?, initialRows?, initialExpanded?, truncated?, lines?, mediaType, wireBytes, decodedBytes?, rawText, bytes }` (`lines` is the per-line markup highlight tokens for `html`/`xml`), where `rawText` is the un-pretty decoded text and `bytes` the decompressed bytes — both always present so the raw/hex view modes have a source for every kind.
- **JSON/NDJSON Web Worker** (`body/json-parse.worker.ts` + `body/json-parse.ts` + `body/json-parse-core.ts`): parsing, tree-building, default-expansion, and the initial flatten all run in a dedicated module Worker so multi-MB bodies don't block the UI thread; the Worker transfers back pre-built `rows` + `defaultExpandedIds` for the initial render. `json-parse-core.ts` holds the pure parse logic (`parseAndFormat`, `parseWithTruncation`, `parseNdjson`) imported by both the Worker script and Node-environment unit tests; a truncated body is recovered to its valid prefix with `best-effort-json-parser` and its cut point marked (`markTruncationPoint`). `json-parse.ts` is the main-thread client: a lazy singleton Worker with job-ID message routing exposing `parseJson(text)` and `parseNdjson(text)` (both `Promise<JsonParseResult>`, with a `mode` discriminator on the wire). The Worker is created on first JSON/NDJSON body and reused thereafter; a fatal worker error resets the singleton so the next parse creates a fresh one. `BodyPane` shows a skeleton while the Worker is in flight.
- **HTML/XML markup Web Worker** (`body/markup-format.worker.ts` + `body/markup-format.ts` + `body/markup-format-core.ts`, PRO-414): for `html`/`xml` bodies the Worker pretty-prints (re-indents) the often-minified source, then tokenizes it with Prism's `markup` grammar (covers HTML, XML, SVG, and all XML dialects) into **per-line** highlight tokens. Re-indentation is a prerequisite for line virtualization — a minified body is a single multi-MB line. `markup-format-core.ts` is the pure core (`prettyPrintMarkup` via `xml-formatter`/`js-beautify`, both pure-JS since `DOMParser` is unavailable in Workers; `tokenizeMarkup` flattens Prism's token stream to lines) shared by the Worker and Node tests; `body/prism-setup.ts` is imported before `prismjs` to disable Prism's built-in Worker message handler. `markup-format.ts` is the main-thread client (lazy singleton Worker, `formatMarkup(text, kind)` → `Promise<{ lines, formattedText }>`). The `formatted` view (`components/markup-view.tsx`) virtualizes the lines with `@tanstack/react-virtual` (hex-view pattern); colors are `--markup-*` design tokens, so both themes resolve without inline styles. A fatal worker error degrades to the plain text view.
- A shared **parsed / raw / hex view-mode toggle** (`bodyViewMode`, session-only store state; PRO-336) selects how `BodyPane` renders the decoded body: `parsed` is the kind-switched smart rendering below; `raw` is `RawView` (line-numbered, wrapping decoded text from `rawText`); `hex` is `HexView` (virtualized hex + ASCII dump of `bytes`, formatting helpers in `lib/hex.ts`). The selector lives in the `Inspector` tab strip and, for msearch exchanges, gains a type-specific `paired` option; `BodySplit` reads the same store slice to drive both panes.
- `JsonViewer` renders pretty JSON with a tiny line tokenizer and virtualizes the lines (20px rows).
- **SSE bodies** use an incremental pipeline in the reducer, not the component layer. When the reducer sees a `text/event-stream` content type, it initializes `BodyState.sseState` (an `SSEStreamState` from `body/sse-stream.ts`) and keeps `chunks` empty — parsed events are the canonical representation. Each `BodyData` chunk is fed through `feedChunk()` (O(chunk size), not O(total stream)) which prepends the `parserRemainder`, splits on `\n\n`, parses complete blocks via `parseSSEBlock()` (extracted from `body/sse.ts`), and stores the incomplete tail as the new remainder. `applyRetention()` caps the event array at `MAX_SSE_EVENTS` (10,000). All functions are pure and immutable — each call returns a new `SSEStreamState`. The generic `StreamView` and `ChatStreamView` read `body.sseState.events` directly (no `useMemo` parse) and share scroll-follow logic via `useStreamFollow` and event rendering via `event-log.tsx` (`EventLog`). `EventLog` virtualizes its event list with `@tanstack/react-virtual` (same pattern as `ExchangeList`), so only visible rows plus overscan are in the DOM even at the 10,000-event retention cap; it renders the v2.3 scaffold's plain semantic-token text labels (`eventTypeClass`) rather than the retired filled-pill `eventTypeBadgeClass`, and tags each event through the additive `classifyEvent` seam (`body/sse.ts`, one `{ kind: "generic" }` variant today). The original `parseSSEBody`/`chunksToText` in `body/sse.ts` are kept for backward compatibility. For Anthropic, `anthropic/transcript.ts` `extractAnthropicTranscript(events)` folds the SSE event sequence (`message_start`, `content_block_delta` text deltas, `message_delta`, `message_stop`) into `{ text, model, messageId, stopReason, usage, isComplete }`.

### Path aliases

- `@bindings/*` → `../bindings/*` — TypeScript types **generated from the Rust backend** by ts-rs (do not edit; they're regenerated). Defined in `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`.
- `@ui/*` → `./src/*` — internal imports.

## Architectural patterns

- **Store-as-reducer.** The domain mutation lives in a pure function (`apply`) that the store action (`applyEvent`) wraps with copy-on-write. The pure core is testable without React; the store is a thin shell over it.
- **Pure helpers over hooks.** Formatting, classification, URI parsing, filtering, trace coloring, header masking/sorting, and SSE event badge classification live as pure functions in `lib/utils.ts`. Theme DOM mutation and persistence are owned by next-themes; the only local theme module is `theme/theme.ts` (the `ThemePreference` type, `DEFAULT_THEME`, and `resolveDefaultTheme`, which parses the `?defaultTheme=` query param). These are unit-tested directly. Components stay thin.
- **Shared tick source.** `lib/tickSource.ts` is a module-level singleton that fires a 1 Hz interval only while there are subscribers. `useRelativeTime` subscribes to it to drive live relative-time displays without each component owning its own `setInterval`.
- **Derive, don't store, the visible list.** `selectedId`/`filter`/`order` are stored; the filtered+ordered exchange array is recomputed each render in both `ExchangeList` and `Inspector` (they intentionally mirror the same derivation).
- **Virtualized lists.** `@tanstack/react-virtual` backs the exchange list, the SSE event list (`event-log.tsx`), and the JSON viewer; the `react-hooks/incompatible-library` lint suppressions are intentional (see Libraries note).
- **shadcn/ui primitives.** `components/ui/` holds shadcn-generated Radix/cmdk wrappers (`components.json`, new-york style, lucide icons). Treat them as vendored primitives; app-specific composition lives in `components/`. Coverage and some lint conventions treat `components/ui/**` as generated.
- **Theming via Tailwind tokens (v2.4 contract in `app/globals.css`).** `app/globals.css` is the canonical token contract: raw values live in `:root` (light) and `.dark` (dark overrides); a separate `@theme inline` block exposes them as Tailwind utilities and aliases shadcn's standard semantic tokens (`--color-primary`, `--color-ring`, `--color-muted-foreground`, etc.) onto the palette so vendored `components/ui/*` primitives resolve those utilities without per-call-site overrides (`@theme inline` is required because the values are `var()` references). The dark variant is `@custom-variant dark (&:is(.dark *))`, keyed on the **next-themes `.dark` class on `<html>`** (no more `[data-theme=dark]`). The theme preference is a three-state enum (`'light' | 'dark' | 'system'`); `'system'` follows the OS via `matchMedia`. Exactly two code paths write the `.dark` class: the bootstrap IIFE in `index.html` (first paint) and next-themes (runtime); no other code touches it. A `@layer base` rule sets the default `border-color` to `var(--color-border)` (Tailwind v4 preflight uses `currentColor`). Components reference token utilities (`bg-card`, `text-muted-foreground`, `text-method-get`, …) rather than raw colors.
- **Density via a single attribute.** `density` (`'regular' | 'compact'`) lives in the store; the `subscribeWithSelector` subscription in `store.ts` is the sole writer of `<html data-density>`. `globals.css` keys its size-token swaps and the `compact:` `@custom-variant` off that attribute; `useDensity()` (`lib/density.tsx`) reads the same store slice (no `<DensityProvider>`), so density has one source of truth.
- **Test-harness hooks (`window.__test_store` / `window.__test_scenes` / `window.__test_theme`).** All are exposed when `import.meta.env.DEV` **or** `import.meta.env.VITE_EXPOSE_TEST_HOOKS === "true"`. `__test_theme` (installed by `ThemeTestBridge` in `App.tsx`) bridges next-themes' `{ theme, resolvedTheme, setTheme }` to the Playwright/component harnesses, since theme is no longer reachable through `__test_store`. The flag comes from `.env.test`, loaded by `pnpm build:test` (`vite build --mode test`) — the build the Playwright suite serves via `vite preview` (see "Testing" below). A plain `pnpm build` sets neither, so both hooks are tree-shaken / dead-code-eliminated from production bundles. `state/store.ts` exposes the store on `window.__test_store`; this is **load-bearing** for the Playwright harness (`browser/helpers/inject.ts` drives `applyEvent`/`getState`/`setState` through it). Do not remove it.
- **Fixture matrix (`window.__test_scenes`).** `src/test/scenes.ts` defines `SCENES` — a deterministic, injectable matrix of UI states (empty/loading/error/selected, long URI/status/error, many rows, dual wire/decoded size, rows vs table, compact vs regular) used by the visual-review workflow (PRO-229/PRO-235). `main.tsx` installs the `window.__test_scenes` harness (`list`/`apply`/`widths`) under the same gate as `__test_store`, via a dynamic import that is dead-code-eliminated from production. `applySceneToStore` is the pure applier shared by the harness and `browser/fixture-matrix.spec.ts`. The list-pane width axis is an interaction (`dragListPaneTo` in `browser/helpers/scenes.ts`), not store state. See [`docs/fixture-matrix.md`](./docs/fixture-matrix.md).

## High-level structure / file map

```
ui/
  src/
    api/            # Backend access. info.ts (fetchInfo, /info, Info type); sse.ts (subscribeToEvents, EventSource, ConnectionStatus; emits postMessage to parent on connect/disconnect)
    body/           # Body decoding. decode.ts (chunks→bytes→decompress→classify json/ndjson/html/xml/image/text/binary); json-parse-core.ts (pure parseAndFormat/parseWithTruncation/parseNdjson — shared by Worker and tests); json-parse.worker.ts (Web Worker script — parse + tree build + flatten off main thread, json + ndjson modes); json-parse.ts (main-thread Worker client — lazy singleton, parseJson()/parseNdjson()); markup-format-core.ts (pure prettyPrintMarkup + tokenizeMarkup for html/xml — shared by Worker and tests); markup-format.worker.ts (Web Worker — re-indent + Prism tokenize off main thread); markup-format.ts (main-thread Worker client — formatMarkup()); prism-setup.ts (configures Prism before import); sse.ts (parseSSEBlock, parseSSEBody, chunksToText); sse-stream.ts (SSEStreamState, feedChunk, applyRetention, chunkToText — incremental SSE parser)
    anthropic/      # transcript.ts — folds an SSE event stream into an Anthropic chat transcript summary
    state/          # store.ts (Zustand store + persist middleware + UI state + density-ownership data-density subscription + dev __test_store); reducer.ts (pure apply() + evict() FIFO caps); types.ts (Exchange/BodyState/ExchangeError shapes)
    protocol/       # index.ts — protocol-aware UI gating; showPairsTab() (ES/OpenSearch bulk ops only)
    hooks/          # useDecodeBody.ts — async decode-on-complete hook used by BodyPane; useRelativeTime.ts — live relative-time display backed by tickSource; useStreamFollow.ts — shared scroll-follow/jump logic for SSE stream views
    lib/            # utils.ts — pure helpers: cn, formatSize, status/method class mappers, traceColor, formatTime, formatRelative, matchesFilter, splitUri, parseQueryParams, shortenTraceId, isBulkOperation, maskHeaderValue, decodeBasicAuth, filterHeaders, sortHeadersByPin, PINNED_HEADER_NAMES
                    # tickSource.ts — shared 1 Hz singleton interval (subscribe/unsubscribe); starts/stops automatically with subscriber count
                    # density.tsx — useDensity() store-derived density hook (no DensityProvider); ROW_PX virtualization heights
    app/            # globals.css — v2.3 token contract (:root/.dark raw tokens + @theme inline shadcn aliases + @custom-variant dark/compact + @layer base border-color)
    theme/          # theme.ts (ThemePreference, DEFAULT_THEME, resolveDefaultTheme)
    components/     # App-owned components, flat kebab-case: body-split, body-pane, text-view, markup-view (virtualized html/xml formatted view), hex-view, live-indicator, stream-error-banner, plus v2.4 shell/chrome scaffolds (app-shell, top-bar, filter-bar, status-bar, command-palette, shortcuts-overlay, exchange-table, exchange-row, inspector, stream-view, event-log, method/status/connection atoms)
      json-tree/    # virtualized JSON + NDJSON tree viewer subpackage (model, flatten/flattenForest, expand, JsonTreeViewer, dev #json-tree-harness): collapse-by-default trees, NDJSON forest display, truncation banner + marker, copy value/path
      ui/           # shadcn/ui primitives (Radix/cmdk wrappers): button, dialog, tabs, tooltip, dropdown-menu, context-menu, command + EmptyState, MethodBadge, SimpleTooltip
      anthropic/    # chat-stream-view.tsx — Anthropic SSE/chat-transcript renderer (events mode via event-log)
    test/           # setup.ts (jest-dom for jsdom project); fixtures.ts (shared EventMessage builders); scenes.ts (fixture matrix + window.__test_scenes harness)
    __tests__/      # Vitest tests — *.test.ts (node) and *.test.tsx (jsdom)
    App.tsx         # Root — next-themes ThemeProvider + TooltipProvider + Toaster wrapping AppShell; dev-only ThemeTestBridge (__test_theme)
    main.tsx        # Entry point — fonts + app/globals.css import + dev-only __test_scenes install + createRoot render
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

Brief overview; the deep detail (patterns, fixtures, coverage policy, browser-test gotchas) is in the path-scoped rule **`.claude/rules/ui-testing.md`** (auto-loads when you read files under `ui/`'s test directories) — read it before writing tests.

Three tiers, with Vitest auto-selecting its project by file extension:

| Tier      | Files                      | Project / runner | Environment                                                             |
| --------- | -------------------------- | ---------------- | ----------------------------------------------------------------------- |
| Unit      | `src/__tests__/*.test.ts`  | Vitest `node`    | node — pure functions: reducer, decoders, parsers, formatters           |
| Component | `src/__tests__/*.test.tsx` | Vitest `jsdom`   | jsdom — React components + hooks; jest-dom matchers via `test/setup.ts` |
| Browser   | `browser/*.spec.ts`        | Playwright       | chromium — rendering/layout/interaction through the real DOM + store    |

The browser suite is **not** full-stack e2e: it injects `EventMessage`s straight into the store via `window.__test_store` (`browser/helpers/inject.ts`) and stubs `/info` and `/service/.../events` with `page.route`, so the real `EventSource` path is not exercised. Shared `EventMessage` fixtures live in `src/test/fixtures.ts` and are re-exported to `browser/fixtures/exchanges.ts`. Coverage thresholds are floored in `vitest.config.ts` (ratchet up, never down); `components/ui/**`, `theme/**`, `main.tsx`/`App.tsx`, and the test dirs are excluded.

`browser/a11y.spec.ts` runs an `@axe-core/playwright` axe scan on both the empty page and with an exchange selected. The scan is **advisory, not a gate** — a11y is low priority for protospy (no screen-reader target), so violations never fail the test or block merge. They surface as `console.warn` lines in the output and are recorded as `testInfo.annotations` (HTML report) and attached as JSON for triage. The scan keeps the full WCAG tag set, so keyboard/focus rules still run — keyboard/focus quality remains the a11y bar.
