# protospy-ui

React + TypeScript frontend for the protospy HTTP monitoring proxy. Built with Vite, Tailwind CSS v4, and Zustand.

## Requirements

- Node.js 22+
- pnpm 10+

## Setup

```sh
pnpm install
```

## Development

Start the dev server (proxies API calls to the protospy backend on port 3100):

```sh
pnpm dev
```

The UI is served at `http://localhost:5173`. Requests to `/info` and `/service/*` are forwarded to `http://localhost:3100`, so the protospy backend must be running for API calls to work.

### Running requests

To generate example traffic to observe in the UI, there are shell scripts in `../scripts/examples/`, e.g. `../scripts/examples/es-get-root`. They use curl to send requests to port 3000; with protospy and Elasticsearch running, these exchanges will be visible in the UI. The scripts produce no output on success.

### Bundle size

This uses [rollup-plugin-visualizer][] to show the bundle size breakdown,
written to `stats.html` after a build.

[rollup-plugin-visualizer]: https://github.com/btd/rollup-plugin-visualizer

## Commands

| Command                    | Description                                         |
| -------------------------- | --------------------------------------------------- |
| `pnpm dev`                 | Start dev server with HMR                           |
| `pnpm build`               | Production build (output: `dist/`)                  |
| `pnpm preview`             | Preview the production build locally                |
| `pnpm lint`                | Run ESLint                                          |
| `pnpm format`              | Format with Prettier                                |
| `pnpm format:check`        | Check formatting without writing                    |
| `pnpm typecheck`           | Type-check without emitting                         |
| `pnpm test`                | Run unit + component tests with Vitest              |
| `pnpm test:coverage`       | Vitest run with v8 coverage report (`coverage/`)    |
| `pnpm test:browser`        | Playwright UI tests (requires `playwright install`) |
| `pnpm test:browser:headed` | Playwright UI tests with a visible browser          |

## Screenshots

To regenerate the hero screenshots in `docs/screenshots/`, run from the repo root:

```sh
just screenshots
```

This builds the protospy binary, starts the backend and a Vite dev server on isolated ports, sends example requests through the proxy, and captures three dark-mode 1280×720 PNGs with Playwright. The generated files are committed to the repo.

## Architecture

For the full deep dive (data flow, type shapes, patterns, per-directory map), see [`ARCHITECTURE.md`](./ARCHITECTURE.md). A summary:

**Stack:** React 19 + TypeScript, built with Vite; Tailwind CSS v4 for styling (token contract in `app/globals.css`); next-themes for light/dark theming (`.dark` class on `<html>`); Zustand for state; TanStack Virtual for list/JSON virtualization; shadcn/ui (Radix + cmdk) for UI primitives; Vitest + Playwright for tests.

**Data flow:** On mount the app fetches `/info` to discover services, then opens an SSE `EventSource` at `/service/<name>/events`. Each `exchange-report` event is parsed into an `EventMessage` and fed to the store's `applyEvent`, whose pure reducer (`state/reducer.ts`) reassembles request/response **exchanges** keyed by exchange id. Components subscribe to store slices and render a virtualized list of exchanges (left) and a detail inspector (right). Bodies are decoded lazily by `body/` (chunk concatenation, gzip/deflate/brotli/zstd decompression, JSON/NDJSON/HTML/XML/SSE detection) once complete; JSON/NDJSON and HTML/XML are each offloaded to a Web Worker (the latter re-indents and syntax-highlights via Prism for the virtualized formatted view).

**Key patterns:** the store is a thin shell over a pure reducer; formatting/classification live as pure helpers in `lib/`; theme is owned by next-themes (the store's `subscribeWithSelector` subscription owns only `<html data-density>`); the visible list is derived (not stored); the v2.4 shell persists list pane pixel widths per mode and preserves that pixel width across viewport resizes; lists and JSON are virtualized; in dev the store is exposed on `window.__test_store` for the browser test harness, `window.__test_theme` bridges next-themes' control, and `window.__test_scenes` exposes the injectable fixture matrix (see `docs/fixture-matrix.md`).

**Structure overview:**

```
src/
  api/          # /info fetch + SSE EventSource subscription
  body/         # Body decoding (compression, JSON/NDJSON) and SSE parsing
  anthropic/    # Anthropic SSE → chat transcript extraction
  state/        # Zustand store + pure EventMessage reducer (Exchange shapes)
  protocol/     # Protocol-aware UI gating (ES/OpenSearch bulk ops)
  hooks/        # Extracted hooks (e.g. useDecodeBody)
  lib/          # Pure helpers (utils.ts: formatters, matchers, splitUri, traceColor); density.tsx (store-derived useDensity)
  components/   # React components; components/protospy/ is the live v2.4 shell/chrome scaffold, components/ui/ are shadcn primitives
  app/          # globals.css — v2.3 design-system token contract
  theme/        # theme.ts (preference type + default resolution)
  test/         # setup.ts (jest-dom) and fixtures.ts (shared with browser tests)
  __tests__/    # Vitest tests (.test.ts → node; .test.tsx → jsdom)
  App.tsx       # Root — next-themes ThemeProvider wrapping AppShell
  main.tsx      # Entry point — globals.css import + render
browser/        # Playwright specs and fixtures/helpers (UI tests, not full-stack e2e)
```

The `@bindings/` path alias points to `../bindings/` (TypeScript types generated from the Rust backend); `@ui/` points to `./src/`.

## Testing

`pnpm test` runs Vitest (unit + component); `pnpm test:browser` runs Playwright UI tests against a `vite preview` of a test-mode build (rendering, layout, and interaction — not a true full-stack end-to-end suite). Coverage thresholds are stored in `coverage-thresholds.json` and ratcheted automatically on a weekly schedule (`pnpm run coverage:ratchet` to run manually). See `CLAUDE.md` for the project split, fixture conventions, and coverage policy.

## React Compiler

This project does not run [React Compiler](https://react.dev/learn/react-compiler) — `@vitejs/plugin-react` is configured without `babel-plugin-react-compiler`. However, `eslint-plugin-react-hooks@7` bundles the compiler's static checks, so its diagnostics surface during `pnpm lint` even without the build-time transform.

The `react-hooks/incompatible-library` warnings on `useVirtualizer` (TanStack Virtual) are suppressed at the call sites with an explanatory comment: the compiler would bail out on those components rather than risk caching stale closures, and since we don't run the compiler the bail-out has no effect. The suppressions should be revisited if React Compiler is ever adopted here.
