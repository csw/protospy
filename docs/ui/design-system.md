# protospy UI — Design System (v2.4)

Agent-facing rules for building protospy's UI. Terse and prescriptive. Rationale
lives in `rationale.md`; the UI-region → component map lives in `mapping.md`; the
visual reference is `docs/ui/index.html`; the landed scaffold code is under
`ui/src/components/protospy/` and `ui/src/lib/`.

> **Changelog**
>
> - **v2.4** — Shipped the interactive surfaces: shortcuts overlay (store `helpOpen`),
>   group-by-trace cards w/ collapse, full ⌘K command set + jump-to-trace, and
>   conformed the legacy Anthropic `ChatStreamView` to v2.3 (shared `LiveIndicator`
>   on `--conn-*` tokens, segmented control, no replay/counter). Promoted
>   `EmptyState` and `BodyState` to scaffolds; added `@keyframes caret`.
> - **v2.3** — App shell + chrome scaffolds, store-connected (`@ui/state/store`);
>   `--conn-*` connection tokens.
> - **v2.2** — Content components (table, rows, rail, inspector, viewers).

> **Prime directive:** reach for a stock **shadcn/Radix** primitive first. Build a
> custom component only for the content-centric core (list, trace rail, body
> viewers, msearch, stream). Never invent a token or a raw color.

---

## 1. Stack

| Concern         | Choice                                                |
| --------------- | ----------------------------------------------------- |
| Framework       | React 19 + TypeScript (non-negotiable)                |
| Styling         | Tailwind v4 (CSS-first `@theme`)                      |
| Primitives      | shadcn/ui (Radix under the hood)                      |
| Icons           | `lucide-react`                                        |
| Dark mode       | `next-themes`, `class` strategy (`.dark` on `<html>`) |
| Command palette | `cmdk` (shadcn `Command`)                             |
| Resizable split | `react-resizable-panels` (shadcn `Resizable`)         |
| List perf       | `@tanstack/react-virtual`                             |
| Exchange table  | `@tanstack/react-table` (headless) + react-virtual    |
| Toasts          | `sonner`                                              |
| Variants        | `class-variance-authority` + `cn()`                   |

Use Radix directly only where shadcn ships no wrapper.

---

## 2. Tokens — the contract

All color/size comes from tokens defined in `ui/src/app/globals.css`. Components
reference **token utilities**, never literals. Tokens resolve per theme and per
density automatically.

### 2.1 Semantic slots (shadcn standard — stock components inherit these)

| Token                            | Role                       | Token                                | Role                               |
| -------------------------------- | -------------------------- | ------------------------------------ | ---------------------------------- |
| `background` / `foreground`      | app canvas / primary text  | `border` / `input`                   | hairlines / field borders          |
| `card` / `card-foreground`       | panels, popovers           | `ring`                               | focus ring (= brand blue)          |
| `popover` / `popover-foreground` | overlays                   | `muted` / `muted-foreground`         | muted surface / **secondary text** |
| `primary` / `primary-foreground` | **brand blue**, actions    | `secondary` / `secondary-foreground` | subtle fills, toolbars             |
| `accent` / `accent-foreground`   | **selected/hover surface** | `destructive`                        | destructive actions                |

> ⚠️ **`accent` is NOT the brand color.** `primary` is the blue; `accent` is the
> soft surface behind a hovered menu item / selected row. Wiring the blue into
> `accent` makes every dropdown row glow blue. (Extra surface steps: `hover`,
> `border-strong`.)

### 2.2 Domain namespaces (layered on top)

| Namespace  | Utilities                                                                                   | Use                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Status     | `text-ok` `text-redirect` `text-client` `text-server` `text-pending` `text-error` (+ `-bg`) | status codes, connection dot                                                                                                        |
| Method     | `text-method-get` … `bg-method-get-bg` (get/post/put/patch/delete/head/options)             | method badge only                                                                                                                   |
| JSON       | `text-json-key` `-string` `-number` `-boolean` `-null` `-punct` `-lineno`                   | body viewers                                                                                                                        |
| Truncation | `text-truncation` `bg-truncation-bg`                                                        | truncated-body caution (JSON viewer banner + in-tree cut-point marker); a var() alias to the redirect amber, not the red error slot |
| Trace      | `--trace-1`…`--trace-7` (also `text-/bg-trace-N`)                                           | rail, tags, group cards                                                                                                             |

Map a status to its kind with `statusClass()`; a trace id to its color with
`traceColorVar()` / `traceTokenIndex()` (deterministic `hash(id) % 7`).

### 2.3 Type & size tokens (density-aware)

`text-ui` (13/12.5) · `text-mono` (12.5/12) · `text-sm` (11.5/11) · `text-xs` (10.5/10).
Sizing utilities: `h-row` `h-row-table` `h-topbar` `h-tab` `h-strip` `h-ctxbar`,
`px-gutter-x`, `gap-gutter`, radii `rounded-sm|md|lg` (4/6/8). Fonts: `font-sans`
(Inter), `font-mono` (JetBrains Mono).

`h-tab` sizes the inspector tab strip; `h-strip` is the shared height for chrome
sub-header strips (pane heads, list toolbar, trace-group header). They are
separate tokens — currently the same value, but the strips must not be coupled to
the tab strip's height. Reach for the density-aware token, never a literal like
`h-[30px]`.

### 2.4 Dark-mode styling

`@custom-variant dark (&:is(.dark *))` overrides Tailwind's built-in `dark:`
variant. All `dark:` utilities fire on the `.dark` ancestor class (set by
next-themes), not `prefers-color-scheme`.

**Semantic color** lives in the token contract: `:root` / `.dark` blocks define
per-theme values, components use token utilities (`bg-card`, `text-foreground`).
This is the default path — app components must not use the `dark:` variant for
color.

**`dark:` variant** is reserved for **treatment refinements in shadcn wrappers**
(`components/ui/`): opacity, shadow depth, border weight — where dark mode
changes _how_ a token is applied, not _which_ color. Examples:
`dark:bg-input/30`, `dark:bg-destructive/60`, `dark:data-[state=on]:shadow-sm`.
If an app component needs dark-specific styling, add a token instead.

### 2.5 Density (hybrid)

`<DensityProvider>` sets `data-density` on `<html>`. That single attribute drives:

1. **token swaps** (most sizing flips automatically — prefer this),
2. the **`compact:`** Tailwind variant (only for a delta a token can't express, e.g. hiding an element),
3. **`useDensity().rowPx`** — numeric px for the virtualizer (CSS can't give JS a number).

Do **not** branch on density in JSX for styling. Do **not** hardcode row heights —
read `rowPx`.

---

## 3. Component selection (decision table)

| Need                                                                 | Use                                                                                                       | Kind   |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| Button / action                                                      | `Button` (variants: default/secondary/outline/ghost/destructive/link)                                     | shadcn |
| Icon-only control                                                    | `Button size="icon"` + lucide icon                                                                        | shadcn |
| Filter input                                                         | `Input`                                                                                                   | shadcn |
| Protocol tag / count                                                 | `Badge`                                                                                                   | shadcn |
| Segmented toggle (rows/table, transcript/events, density, Local/UTC) | `ToggleGroup type="single"`                                                                               | Radix  |
| On/off (group-by-trace, paired)                                      | `Switch`                                                                                                  | Radix  |
| Inspector tab strip                                                  | `Tabs` (underline variant)                                                                                | Radix  |
| Hover hint, abbreviated media type                                   | `Tooltip`                                                                                                 | Radix  |
| Service picker                                                       | `DropdownMenu`                                                                                            | shadcn |
| ⌘K palette (commands only)                                           | `Command` (cmdk)                                                                                          | lib    |
| Keyboard help / shortcuts sheet                                      | `Dialog` → `shortcuts-overlay.tsx`                                                                        | shadcn |
| Disclosure (headers, msearch responses)                              | `Collapsible`                                                                                             | Radix  |
| List ↔ inspector divider                                             | `ResizablePanelGroup`                                                                                     | lib    |
| Copy / connection toast                                              | `sonner`                                                                                                  | lib    |
| Awaiting-body placeholder                                            | `Skeleton`                                                                                                | shadcn |
| Divider                                                              | `Separator`                                                                                               | shadcn |
| **Exchange table (table mode)**                                      | `exchange-table.tsx` (react-table + virtual)                                                              | custom |
| **Exchange row (rows mode, default)**                                | `exchange-row.tsx`                                                                                        | custom |
| **Trace rail**                                                       | `trace-rail.tsx`                                                                                          | custom |
| **JSON / NDJSON body**                                               | `json-tree/` subpackage (`JsonTreeViewer` — virtualized tree, NDJSON forest, truncation, copy value/path) | custom |
| **Node copy menu**                                                   | `ContextMenu`                                                                                             | shadcn |
| **msearch paired view**                                              | `msearch-view.tsx`                                                                                        | custom |
| **SSE stream view**                                                  | `stream-view.tsx`                                                                                         | custom |
| **Chat stream view (Anthropic)**                                     | `chat-stream-view.tsx`                                                                                    | custom |
| **Trace group card (grouped mode)**                                  | `trace-group.tsx`                                                                                         | custom |
| **List empty / body lifecycle**                                      | `empty-state.tsx` / `body-state.tsx`                                                                      | custom |
| Method badge / status / trace pill / connection dot                  | `protospy/*` atoms                                                                                        | custom |

This table is illustrative, not exhaustive. If a need isn't listed and a shadcn
or Radix primitive fits → use it. Custom is only for the content-centric core
above.

---

## 4. Hard rules

1. **Tokens, not colors.** No hex/oklch/`rgb()` in components. Only sanctioned raw
   value: dynamic trace color via `style={{ background: traceColorVar(id) }}`.
2. **Naming.** Component/type names use **Exchange**; surface text says **Request(s)**
   ("Requests", "N requests", "N of M"). Never show "Exchange" to the user.
3. **Truncation invariant.** Fixed metadata — **timestamp, status, method, elapsed,
   size** — renders in full; size the column to the value. Only **path** and **body**
   may truncate (behind an expand affordance).
4. **Network error ≠ HTTP error.** A transport failure (`exchange.error != null`,
   no HTTP response) and a 5xx are distinct treatments. Net error → `StatusCode`
   renders "Error" + the row's net-error edge; 5xx → red code. (Exact strings are
   app-owned.)
5. **Body panes are lifecycle-aware.** `awaiting` (no status/headers) vs `streaming`
   (partial body) vs `complete` — symmetric on request/response. Not a flat "pending".
6. **Rows is the default list view.** Table mode is the alternate. Default order
   **newest-first**. (PRO-402: rows is the more distinctive trace-rail
   presentation; the chosen mode persists per user.)
7. **Status display.** Table = numeric code only. Rows = full status line
   (`StatusCode full`).
8. **Size = response wire size** + compression marker (tooltip `wire / decoded (enc)`),
   not a request+response sum.
9. **Time** is absolute `HH:MM:SS.mmm` with a **Local/UTC** toggle in the list toolbar.
10. **One Headers tab** (request + response side-by-side; counts in pane subheads, not
    tab badges). **msearch** is an in-Bodies `Paired / Raw NDJSON` toggle in the tab
    strip — not a separate tab.
11. **Stream:** play/pause; **no replay, no N/Total counter**. Live indicator has four
    states: live / paused / disconnected / complete.
12. **Palette is commands-only** (no per-exchange search list). Include a timezone
    command.
13. **Theme** cycles three states: light → dark → system.
14. **No synthetic timing waterfall.** Timing tab = facts only, "bytes" terminology.
15. **Primitive over hand-roll.** Prefer the stock shadcn/Radix primitive over a
    hand-rolled equivalent (`button`, toggle, switch, tooltip, dialog, ...). The
    §3 table is illustrative, not exhaustive: an interactive element whose
    semantics match an existing primitive must use it, even if that exact
    affordance is not a listed row. Example: a two-state selection uses
    `Toggle`/`aria-pressed`, not a bespoke `<button>` state machine. Custom is
    only for the content-centric core named in §3.
16. **Modifier-scoped overrides must actually win.** tailwind-merge only
    de-duplicates classes that share the same variant scope: `cn("md:text-sm",
"text-xs")` keeps **both** — at `md` and up the prefixed class still applies.
    An unprefixed (or differently-prefixed) class does not override a
    variant-prefixed one from a base/CVA primitive. Before overriding a class a
    vendored primitive carries under a variant, match that variant. Two ways this
    has bitten: dropping `md:text-xs` against the `Input` base's `md:text-sm` is a
    silent 12px→14px desktop regression; `p-0` lost to an `xs` button variant's
    `has-[>svg]:px-1.5` because `:has()` raises CSS specificity. When unsure
    whether an override resolves, check the token-resolution map (the
    `token-resolution-map` script) or render it — don't assume later-in-the-string
    wins.

---

## 5. Layout

```
TopBar (h-topbar)      brand · service picker · ⌘K · group-by-trace · density · theme
FilterBar (h-filterbar) [Input]                                   N requests
Main  ResizablePanelGroup:
  ┌ List panel ─────────────┬ Inspector panel ───────────────────┐
  │ toolbar (Requests · Local/UTC · order · rows/table)           │
  │ [TraceRail | ExchangeTable/Rows]   │ ContextBar               │
  │                                    │ Tabs: Bodies·Headers·Timing│
  │                                    │ body region (split/msearch/stream)│
  └────────────────────────┴───────────────────────────────────┘
StatusBar (h-statusbar)  ● connected · upstream · │ N traces · #id · ? shortcuts
```

List/inspector widths persist per list-mode (rows vs table).

---

## 6. Interaction baseline

- Keyboard: `j`/`↓` next, `k`/`↑` prev, `⌘K` palette, `/` focus filter, `?` help.
- Click row → select; click trace rail bar / trace tag → filter to trace; hover a
  trace → cross-highlight members (dim others).
- Focus-visible ring uses `ring-ring`. Respect `prefers-reduced-motion` (pulses,
  caret).
- Hit targets ≥ 24px for dense toolbar controls; ≥ 44px only where touch is plausible
  (this is a desktop tool).

---

## 7. Deferred (don't block MVP; see `rationale.md` §Open items)

Filter grammar, trace-group ordering policy, Jaeger root-info loading, B3/custom
trace headers, multi-service selection. Single-service selection for now. Wire the
component choices so these slot in later without rework.
