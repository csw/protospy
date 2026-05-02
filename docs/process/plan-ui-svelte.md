# protospy UI Svelte 5 evaluation — parallel implementation plan

## Context

The React 19 MVP under `ui/` (planned in `plan-ui-mvp.md`, requirements in
`ui-mvp-requirements.md`) is implemented and working. This plan records the
decision to build a parallel Svelte 5 port under `ui-svelte/` to compare
the developer experience and code shape against React on a real, equivalent
codebase.

The React MVP totals ~2,200 LOC: 14 components (~845 LOC), a Zustand store
(35 LOC), framework-agnostic state/decode/api/lib modules (~390 LOC), and
~890 LOC of tests. Roughly half the codebase — the framework-agnostic
TypeScript modules and most of the tests — copies verbatim. The actual port
work is the 14 components and the store.

## Decision

Build `ui-svelte/` as a sibling of `ui/`. Keep the React UI untouched. Run
both against the same Rust backend (`:3100`) on adjacent ports (React on
`:5173`, Svelte on `:5174`) so we can switch between tabs and judge
ergonomics, bundle size, and reactivity behaviour honestly.

No changes to the Rust backend or the `bindings/` directory. Both UIs
consume the same SSE wire format and the same ts-rs–generated types.

## Rationale

What Svelte 5 likely wins:

- **The async decode in `BodyPane.tsx`** — the React version uses a custom
  `useDecodeBody` hook with a `cancelled` flag, manual `entry.body === body`
  reference checks, and a `useState<DecodeEntry>` that mirrors the in-flight
  result. In Svelte 5 this is a single `$effect` with a returned cleanup;
  the stale-result guard is unnecessary because `$state` is replaced
  atomically when the effect re-runs.
- **AppShell selector boilerplate** — six `useStore(s => s.field)` calls
  collapse to module-level reactive imports.
- **Streaming reactivity** — body-chunk events mutate one exchange's body;
  Svelte's signal-grained updates avoid the whole-subtree re-render that
  Zustand selectors are tuned to suppress.
- **Less ceremony**: no `useMemo`/`useCallback`/dep arrays; `$derived` is
  automatic.
- **Smaller bundle** — drops `react` + `react-dom` (~175 KB gz) for ~3 KB
  of Svelte runtime. Cosmetic for a localhost dev tool but real.

What we accept as risk:

- Rewrite cost on a working UI; the absolute LOC saving is small
  (~250–350 lines).
- Smaller component-library ecosystem (Radix/shadcn → Bits UI / Melt UI /
  shadcn-svelte). The MVP doesn't use any component library today, so this
  is a future concern.
- Svelte 5 runes are ~18 months old; older Svelte 3/4 patterns dominate
  search results. Manageable with the current docs.
- `@testing-library/svelte` works with Vitest but is less battle-tested
  than its React equivalent.

## Layout

```
ui-svelte/                   # parallel to ui/
  package.json               # pnpm 10, node 22
  svelte.config.js
  vite.config.ts             # proxy /info + /service/* to :3100, port 5174
  tsconfig.json
  eslint.config.js
  vitest.config.ts
  CLAUDE.md                  # mirrors ui/CLAUDE.md
  README.md
  justfile                   # `run` -> pnpm dev, `build` -> pnpm build
  src/
    main.ts
    App.svelte
    api/                     # COPIED from ui/src/api/
    body/                    # COPIED from ui/src/body/
    lib/                     # COPIED from ui/src/lib/
    state/
      reducer.ts             # COPIED from ui/src/state/reducer.ts
      store.svelte.ts        # PORTED from ui/src/state/store.ts
    theme/tailwind.css       # COPIED from ui/src/theme/
    components/              # 14 .svelte files (port from .tsx)
    __tests__/               # 4 pure-TS tests COPIED, 2 component tests PORTED
```

Root `justfile` gains `mod ui-svelte`. `protospy.code-workspace` adds
`ui-svelte` as a folder.

## React → Svelte 5 mapping

| React (current)                                              | Svelte 5                                              |
|--------------------------------------------------------------|-------------------------------------------------------|
| `useState<T>(init)`                                          | `let x = $state<T>(init)`                             |
| `useEffect(fn, [deps])`                                      | `$effect(() => { ... return cleanup })`               |
| `useMemo(() => x, [deps])`                                   | `let x = $derived(...)`                               |
| Zustand `create(...)` + `useStore(s => s.field)`             | `.svelte.ts` module with `$state` getters             |
| `Map<id, Exchange>` rebuilt on each event                    | `SvelteMap` from `svelte/reactivity`, or keep swap    |
| JSX `{cond && <X/>}` / `{list.map(...)}`                     | `{#if cond}<X/>{/if}` / `{#each list as x (key)}`     |
| `children: ReactNode`                                        | Snippets: `{@render children()}`                      |
| `@testing-library/react`                                     | `@testing-library/svelte` (same Vitest harness)       |
| `eslint-plugin-react`, `react-hooks`                         | `eslint-plugin-svelte` + `svelte-check`               |

## Verification

Per `CLAUDE.md` ("any code path not covered by the test suite must be
executed manually before committing"):

1. `docker compose up` (Elasticsearch); start protospy on `:3100`.
2. `cd ui-svelte && pnpm dev` → open `http://localhost:5174`.
3. Run example traffic: `scripts/examples/es-get-root` and at least one
   other script.
4. Compare against `http://localhost:5173` (React) running concurrently:
   - Exchange list populates live, same order.
   - Selection shows method, URI, status, elapsed time in the inspector.
   - Request and response bodies decode (including gzip) and JSON
     syntax-highlights.
   - Streaming/partial-body shows "Streaming…" with byte count.
   - Light/dark theme toggle.
   - Connection indicator transitions: connecting → open; kill backend,
     observe reconnecting.
5. Quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
   all clean.
6. Bundle size: `du -sh ui/dist ui-svelte/dist` for a quick comparison.

## Outcome

To be filled in once the port is complete and the comparison is run.
Capture: total LOC delta, bundle size delta, list of places where one
framework was meaningfully nicer, and a recommendation on whether to keep
both, deprecate React, or abandon Svelte.
