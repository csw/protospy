# protospy-ui

React + TypeScript frontend for the protospy HTTP monitoring proxy. Built with Vite, Tailwind CSS v4, and Zustand.

## Requirements

- Node.js 22+
- npm

## Setup

```sh
npm install
```

## Development

Start the dev server (proxies API calls to the protospy backend on port 3100):

```sh
npm run dev
```

The UI is served at `http://localhost:5173`. Requests to `/info` and `/service/*` are forwarded to `http://localhost:3100`, so the protospy backend must be running for API calls to work.

## Commands

| Command                | Description                          |
| ---------------------- | ------------------------------------ |
| `npm run dev`          | Start dev server with HMR            |
| `npm run build`        | Production build (output: `dist/`)   |
| `npm run preview`      | Preview the production build locally |
| `npm run lint`         | Run ESLint                           |
| `npm run format`       | Format with Prettier                 |
| `npm run format:check` | Check formatting without writing     |
| `npm run typecheck`    | Type-check without emitting          |
| `npm test`             | Run unit tests with Vitest           |

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
