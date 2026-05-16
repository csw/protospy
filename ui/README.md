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

## Project Structure

```
src/
  api/          # Typed fetch wrappers (fetchInfo, subscribeToEvents)
  body/         # Body decoding (compression, JSON/JSONL) and SSE parsing
  components/   # React components (incl. components/ui/ shadcn primitives)
  hooks/        # Extracted hooks (e.g. useDecodeBody)
  lib/utils.ts  # Pure helpers — formatters, matchers, splitUri, traceColor
  state/        # Zustand store and the EventMessage reducer
  test/         # setup.ts (jest-dom) and fixtures.ts (shared with browser tests)
  theme/        # Tailwind tokens and theme bootstrap helpers
  __tests__/    # Vitest tests (.test.ts → node; .test.tsx → jsdom)
  App.tsx       # Root component
  main.tsx      # Entry point — theme bootstrap + render
browser/        # Playwright specs and fixtures/helpers (UI tests, not full-stack e2e)
docs/agents/ui/ # Coverage audit + test-plan handoff (repo-level docs/)
```

The `@bindings/` path alias points to `../bindings/` (TypeScript types generated from the Rust backend); `@ui/` points to `./src/`.

## Testing

`pnpm test` runs Vitest (unit + component); `pnpm test:browser` runs Playwright UI tests against the dev server (rendering, layout, and interaction — not a true full-stack end-to-end suite). See `CLAUDE.md` for the project split, fixture conventions, and coverage policy. The audit and test-plan in `docs/agents/ui/` lay out what's covered and what isn't.
