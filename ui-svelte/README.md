# protospy-ui-svelte

Svelte 5 parallel implementation of the protospy UI. Built alongside the React version at `../ui/` to compare developer experience, bundle size, and reactivity behaviour on an equivalent codebase.

## Requirements

- Node.js 22+
- pnpm 10+

## Setup

```sh
pnpm install
```

## Development

Start the dev server on port 5174 (proxies API calls to the protospy backend on port 3100):

```sh
pnpm dev
```

The UI is served at `http://localhost:5174`. The React UI runs concurrently at `http://localhost:5173`.

### Running requests

To generate example traffic, use the shell scripts in `../scripts/examples/`, e.g. `../scripts/examples/es-get-root`. They use curl to send requests to port 3000; with protospy and Elasticsearch running, these exchanges will be visible in the UI.

## Commands

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `pnpm dev`          | Start dev server with HMR (port 5174)|
| `pnpm build`        | Production build (output: `dist/`)   |
| `pnpm preview`      | Preview the production build locally |
| `pnpm lint`         | Run ESLint                           |
| `pnpm format`       | Format with Prettier                 |
| `pnpm format:check` | Check formatting without writing     |
| `pnpm typecheck`    | Type-check with svelte-check         |
| `pnpm test`         | Run unit tests with Vitest           |
