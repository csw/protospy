# CLAUDE.md — protospy UI

If `CLAUDE.local.md` exists in this directory, read it for additional local guidance.

## Architecture

For the deep reference (exact `EventMessage` shape, reducer per-event-type rules, the full body decode pipeline, design-token policy, test-architecture detail), read [`ARCHITECTURE.md`](./ARCHITECTURE.md). The TL;DR below is enough for localized single-component work — but if your change touches any load-bearing or architectural concern, read the deep doc first. That includes, but is not limited to, the SSE pipeline, store shape, reducer, body decode, theming/tokens, persistence/`partialize`, the `__test_store`/`__test_scenes` test hooks, the test project split, or the directory layout. When unsure whether a concern is architectural, read it.

**Keep both current:** when you change the UI's architecture, stack, data flow, or directory structure, update `ARCHITECTURE.md`, the `## Architecture` section of `README.md`, and the TL;DR below in the same change. See [`docs/agents/tldr-maintenance.md`](../docs/agents/tldr-maintenance.md) for the regeneration prompt.

**Design system.** The visual design system, token contract, and component rationale are specified in [`docs/ui/design-system.md`](../docs/ui/design-system.md) (with [`rationale.md`](../docs/ui/rationale.md) and [`mapping.md`](../docs/ui/mapping.md)). Consult it before changing tokens, theming, or shared visual treatment. A per-PR `design-system-conformance-review` subagent (wired into `handle-ticket`, PRO-331) backstops adherence to this spec — including a static both-themes token-resolution check — but getting it right the first time is cheaper than fixing drift it flags. The v2.3 scaffolds under `src/components/protospy/` and their `src/lib/` helpers are **landed but not yet wired** into the live app — integration is tracked separately; do not import them into rendered surfaces as part of unrelated work.

### TL;DR

**Stack.** React ^19 + TypeScript ^6, Zustand ^5 (`persist` middleware), `@tanstack/react-virtual` ^3, Radix ^1.4 primitives (shadcn `new-york` wrappers under `components/ui/`), `cmdk` ^1, `react-resizable-panels` ^4, Tailwind v4 (no `tailwind.config.js` — tokens live in `app/globals.css` under `:root`/`.dark` + `@theme inline`; dark variant is `@custom-variant dark (&:is(.dark *))`, keyed on the `.dark` class; transitional `theme/legacy-tokens.css` quarantines un-migrated v2.1 vocabulary, PRO-345), `next-themes` ^0.4 (owns theme via `.dark` on `<html>`), `sonner` ^2 (toasts). Vite ^8, Vitest ^4 (node + jsdom projects), Playwright. **React Compiler is not run here** — `eslint-plugin-react-hooks@7` surfaces the compiler's static checks at lint time only.

**Architecture in brief.** `api/sse.ts` opens an `EventSource` at `/service/<name>/events`; each `"exchange-report"` event is `JSON.parse`d into an `EventMessage` and passed to `applyEvent(msg)` on the Zustand store (`state/store.ts`), which copy-on-writes `exchanges`/`ids` and delegates to the **pure reducer** `apply()` in `state/reducer.ts` (unit-testable without React in the node project). Components subscribe via `useStore(selector)`; `ExchangeList` and `Inspector` each re-derive the filtered/ordered visible list per render. Theme is owned by next-themes (`.dark` on `<html>`); the store's `subscribeWithSelector` subscription owns only the **`density`** slice → `<html data-density>`. Bodies never touch chunks directly: `BodyPane` → `useDecodeBody` → `decodeBody()` (`body/decode.ts`), and `text/event-stream` bodies parse incrementally in the reducer via `body/sse-stream.ts`. **Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full data flow, the `EventMessage` shape (§3), the reducer per-event rules (§4), and the body/SSE decode pipeline (§6) before any change touching them.**

**Types.** Wire types come from `@bindings/*` (→ `../bindings/`, generated from Rust by ts-rs — **do not edit**). `@ui/*` → `./src/*`.

**Load-bearing details — don't break these:**

- `window.__test_store` in `state/store.ts` is required by the Playwright harness (`browser/helpers/inject.ts`). Exposed when `import.meta.env.DEV` **or** `VITE_EXPOSE_TEST_HOOKS === "true"` (from `.env.test`, set by `pnpm build:test` — the build the browser suite previews); tree-shaken from a plain `pnpm build`. Do not remove.
- `window.__test_scenes`, installed by `main.tsx` from `src/test/scenes.ts` under the same gate as `__test_store`, is the **fixture matrix** used by the visual-review workflow (PRO-229). Each `SCENES` cell is an injectable UI state; `browser/fixture-matrix.spec.ts` walks them. See `docs/fixture-matrix.md`.
- Persisted prefs `localStorage` key is `protospy-ui-prefs`; the `partialize` list in `state/store.ts` defines which UI prefs persist. Renaming the key strands users.
- `state/reducer.ts` is pure on purpose so it can be unit-tested in the `node` project. Do not import React, the store, or anything with side effects into it.

**Directory map (compressed; full annotations in `ARCHITECTURE.md`):**

- `src/api/` — `info.ts` (`fetchInfo`, `/info`), `sse.ts` (`subscribeToEvents`, `ConnectionStatus`, parent-frame `postMessage`)
- `src/state/` — `store.ts` (Zustand + `subscribeWithSelector` + `persist` + `data-density` subscriber + dev `__test_store`), `reducer.ts` (pure `apply`, `Exchange`/`BodyState` shapes)
- `src/body/` — `decode.ts` (chunks→bytes→decompress→classify), `sse.ts` (parseSSEBlock, parseSSEBody, chunksToText), `sse-stream.ts` (SSEStreamState, feedChunk, applyRetention — incremental SSE parser)
- `src/anthropic/` — `transcript.ts` (fold SSE events into chat transcript)
- `src/protocol/` — protocol-aware UI gating (`showPairsTab` for ES/OpenSearch)
- `src/hooks/` — `useDecodeBody`, `useRelativeTime` (backed by `lib/tickSource.ts` shared 1 Hz singleton), `useStreamFollow` (shared scroll-follow for SSE views)
- `src/lib/` — `utils.ts` (`cn`, formatters incl. `formatAbsoluteTime`/`TimeZone`, matchers, trace colors, header helpers), `tickSource.ts`, `density.tsx` (store-derived `useDensity`, `ROW_PX`)
- `src/app/` — `globals.css` (v2.3 token contract: `:root`/`.dark` raw tokens + `@theme inline` shadcn aliases + `@custom-variant dark`/`compact` + `@layer base` default border-color)
- `src/theme/` — `theme.ts` (`ThemePreference` type, `DEFAULT_THEME`, `resolveDefaultTheme`), `legacy-tokens.css` (transitional v2.1 token quarantine, PRO-345 — `@import`'d by `globals.css`, deleted slice-by-slice as surfaces migrate)
- `src/components/` — app components (`AppShell`, `TopBar`, `FilterBar`, `ExchangeList`, `Inspector`, `BodySplit`, `LiveIndicator`, `HeadersSplit`, `JsonViewer`, `TimingView`, `CommandPalette`, …); wired v2.3 scaffolds under `components/protospy/` (incl. `stream-view`, `event-log`); vendored shadcn primitives under `components/ui/`
- `src/test/` (`setup.ts`, `fixtures.ts`, `scenes.ts` — fixture matrix + `window.__test_scenes`), `src/__tests__/` (Vitest)
- `browser/` — Playwright specs (incl. `fixture-matrix.spec.ts`) + `helpers/inject.ts` (drives the store via `window.__test_store`) + `helpers/scenes.ts` (drives `window.__test_scenes`); `browser/fixtures/exchanges.ts` re-exports `src/test/fixtures.ts`
- `docs/fixture-matrix.md` — the injectable state matrix and how to reach each cell

## UI conventions

Standing obligations on every UI change — not reference you reach for only when a
change feels complex.

**Use the existing component library — don't hand-roll.** Before you build any UI
element — button, tooltip, toggle, input, dropdown, dialog, or the like — check
whether a shadcn primitive already exists in `src/components/ui/` and use it. This
is an obligation, not a preference: hand-rolling markup a shadcn primitive already
provides loses focus rings, disabled states, hover behavior, and design-system
consistency, and it is a recurring failure mode for this UI (it has shipped bugs
before). If a primitive's default sizing or spacing doesn't fit, override the
specific dimensions via `className` (e.g. `className="size-4"`) — don't drop to raw
elements just to get the size you want.

**Invoke the convention skills — nothing preloads them.** Three skills are the
convention checklists for this UI. You must invoke them yourself via the Skill tool
rather than waiting for a discovery-tuned trigger to fire:

- `frontend:shadcn-ui` — the component inventory. Invoke before writing any new
  element from scratch, to confirm one doesn't already exist.
- `frontend:react-patterns` — performance and composition rules. Apply whenever you
  write or change a component.
- `frontend:tailwind-theme-builder` — semantic tokens, `@theme inline`, no no-op or
  undefined token classes. Follow whenever you touch styling.

The `convention-review` subagent backstops these on a PR, but fixing drift there
costs more than getting it right the first time.

## Commands

```bash
pnpm dev             # start dev server
pnpm build           # production build (output: dist/)
pnpm add <package>   # add a dependency
pnpm format          # format
pnpm lint            # lint
pnpm typecheck       # type check
pnpm test --reporter=dot            # run unit + component tests (Vitest); omit --reporter=dot for human-readable output
pnpm test:coverage                  # run with v8 coverage report
pnpm test:browser --reporter=dot    # run Playwright browser tests (browsers must be installed); omit --reporter=dot for human-readable output
just screenshots                    # regenerate hero screenshots — run from REPO ROOT, not ui/; ui/justfile has a same-named recipe but it skips the required cargo build step
```

## Manual Testing

To generate traffic for testing UI features, use the example scripts documented in the "Running requests" section of `ui/README.md`. Do not try to inject state programmatically — run the scripts instead.

## Code Quality Requirements

Before reporting work as complete, **all of the following must pass**:

```bash
pnpm lint
pnpm format
pnpm typecheck
pnpm test:coverage
```

`pnpm test:coverage` (unit + component tests plus a coverage report) is your
iterative-development feedback loop: run it after making changes to confirm they
work and stay covered, well before you think the work is done. Coverage thresholds
are configured in `vitest.config.ts` — see the testing section below.

**Do not run `pnpm test:coverage` or `pnpm test:browser` immediately before
`git commit`.** The pre-commit hook runs the identical suites automatically (see
[`docs/agents/quality-gates.md`](../docs/agents/quality-gates.md)), so a manual run
right beforehand only repeats ~30–60s of work and its token output for no extra
signal. The commit is the gate — let the hook run the suites, then fix any failures
it reports and re-commit.

## Definition of Done (any change affecting rendered output)

Passing lint/typecheck/tests is necessary but not sufficient for any change that affects
what the UI renders or how it behaves on screen — this includes changes to reducers,
hooks, selectors, or formatters whose output is visible, not only changes to components or
CSS. Such a change is "done" only when it also clears the **frontend Definition of Done**
([`../docs/frontend-dod.md`](../docs/frontend-dod.md)): the `/protospy-design-review` rubric plus
protospy-specific requirements —

- every **fixture-matrix** state renders correctly (the matrix lives in
  `src/test/scenes.ts`, reachable via `window.__test_scenes`; the full cell list and
  injection calls are in [`docs/fixture-matrix.md`](./docs/fixture-matrix.md)),
- at 1280/1440/1920 in both light and dark themes,
- with clipping affordances, pane bounds respected, and no new console errors.

The `visual-review` subagent automates this check (see the root `CLAUDE.md` "Visual
design reviews" section); it does **not** replace the deterministic `browser/` tests
below.

## Test-Writing Requirements

**Every change to code under `src/` or `browser/` must include corresponding tests.** Shipping UI code without tests — even when the existing suite still passes — is a recurring failure mode that has required expensive backfill passes; the real bar is "tests _exist_ for the code I wrote," not "tests pass." Do not consider a feature, bug fix, or refactor complete until it has test coverage, and if you are about to commit and have not written or updated any test file, stop and ask what you missed.

### Which test type to write

| What you changed                                                                     | Test type      | File pattern                    |
| ------------------------------------------------------------------------------------ | -------------- | ------------------------------- |
| Pure function (formatter, parser, reducer, decoder, utility)                         | Unit test      | `src/__tests__/*.test.ts`       |
| React component or hook (rendering, state, user interaction)                         | Component test | `src/__tests__/*.test.tsx`      |
| Visual layout, cross-component interaction, or behavior that depends on real DOM/CSS | Browser test   | `browser/*.spec.ts`             |
| Styling properties that must match a design spec (font, spacing, color, position)    | Browser test   | `browser/design-tokens.spec.ts` |

When a change spans categories, cover _each_ distinct observable behavior with the cheapest test that exercises it — prefer unit over component, component over browser per behavior. A single cheap test that covers only one layer of a multi-layer change is not sufficient. But if a behavior under test requires the real DOM or layout, don't force it into a unit test.

### What "covered" means

- New exported functions or components must have at least one test exercising their primary behavior.
- Bug fixes must include a test that would have caught the bug (the "regression test" rule).
- Refactors that change observable behavior (even subtly — e.g. a different empty-state message) must update or add assertions covering the new behavior.
- If a change is purely internal (renaming a local variable, reformatting) and no observable behavior changed, no new test is needed — but the existing suite must still pass.

## Testing

The always-on testing **policy** is above: every change under `src/` or
`browser/` needs tests, which type to write for which change, and what "covered"
means. The deep **mechanics** — the Vitest project/environment layout, the
`browser/` injection harness and its scope, the hard-won browser-test patterns,
design-token fidelity tests, fixtures, and coverage-threshold policy — live in
[`.claude/rules/ui-testing.md`](../.claude/rules/ui-testing.md). That path-scoped
rule auto-loads when you read a file under `ui/browser/`, `ui/src/__tests__/`, or
`ui/src/test/`. **Read it before writing or changing a browser test or a
design-token test** — explicitly, since creating a brand-new test file does not
trigger the auto-load.

## Versioning dependencies

Pin dependencies in `package.json` (added with `pnpm add`) to their current major version, and look up the current version rather than guessing. See `docs/agents/dependencies.md` for the full cross-type pinning policy.

## Committing

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/). Use scope `ui`:

```text
feat(ui): add request detail sidebar
fix(ui): fix SSE reconnection on network error
refactor(ui): extract theme tokens
```

`pnpm format` ignores `pnpm-lock.yaml` and the generated `coverage/`, `playwright-report/`, `test-results/` directories (see `.prettierignore`); eslint ignores them too (see `eslint.config.js`). Don't add tests or source files into those directories.
