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

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `pnpm dev`          | Start dev server with HMR            |
| `pnpm build`        | Production build (output: `dist/`)   |
| `pnpm preview`      | Preview the production build locally |
| `pnpm lint`         | Run ESLint                           |
| `pnpm format`       | Format with Prettier                 |
| `pnpm format:check` | Check formatting without writing     |
| `pnpm typecheck`    | Type-check without emitting          |
| `pnpm test`         | Run unit tests with Vitest           |

## Project Structure

```
src/
  api/          # Typed fetch wrappers (fetchInfo, subscribeToEvents)
  components/   # Reusable UI components
  theme/        # Theme definitions and tokens
  App.tsx       # Root component
  main.tsx      # Entry point
```

The `@bindings/` path alias points to `../bindings/`, which contains shared TypeScript types generated from the Rust backend.
