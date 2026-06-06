# protospy UI — Region → Component Map (v2.3)

Every region of the UI and what realizes it. `▣ shadcn · ⬡ Radix · ◷ library · ◆ custom`.
Cross-reference: tokens in `design-system.md §2`, code in `scaffolds/`.

---

## Top bar  `h-topbar`, `bg-card`, bottom `border`

| Element | Component | Notes |
|---|---|---|
| Wordmark | text | `proto` in `foreground` + `spy` in `primary`, `font-sans` 700 |
| Service picker | ▣ `DropdownMenu` + ◆ connection dot | trigger = pill w/ dot + name; menu lists `<upstream> :<port>` per service + "N services configured" footer; single-select |
| Jump to… | ▣ `Button variant="outline" size="sm"` + ◷ `Command` | opens ⌘K palette; shows `⌘K` `<kbd>` |
| Group-by-trace | ▣ `Button size="icon"` (Layers), `active` state | toggles grouping |
| Density | ⬡ `ToggleGroup` or icon button → `DensityProvider.toggle()` | regular ↔ compact |
| Theme | ▣ `Button size="icon"` cycling sun→moon→monitor | `next-themes` three-state (light/dark/system) |

## Filter bar  `h-filterbar`, `bg-background`

| Element | Component | Notes |
|---|---|---|
| Filter input | ▣ `Input` (search-adorned, mono) | substring match MVP; grammar later |
| Active trace chip | ▣ `Badge` + ◆ swatch + clear | shown only when filtered to a trace; `accent` fill |
| Count | text, right-aligned | **"N requests"** / "N of M" — never "exchanges" |

## List panel

| Element | Component | Notes |
|---|---|---|
| Panel + divider | ◷ `ResizablePanelGroup` / `ResizableHandle` | width persists per list-mode |
| Toolbar | div + label + controls | label **"Requests"**; holds Local/UTC, order, rows/table |
| Local/UTC toggle | ⬡ `ToggleGroup` | table mode; timestamps absolute either way |
| Order toggle | ▣ `Button size="icon"` (Arrow) | default **newest-first** |
| Rows/Table toggle | ⬡ `ToggleGroup` (Rows/Table icons) | **Table is default** |
| Trace rail | ◆ `trace-rail.tsx` | lane-packed; fed virtualizer offsets; single-member traces excluded |
| Table (default) | ◆ `exchange-table.tsx` (◷ react-table + react-virtual) | cols: Method·Status·Path·Elapsed·Size·Time |
| Row (rows mode) | ◆ `exchange-row.tsx` | 3-line; full status line; trace left-border |
| Trace group card | ◆ (group variant) | header + indented members when grouping on |
| Empty — first run | ◆ `EmptyState` | "No requests yet" + traffic-flows hint |
| Empty — filtered | ◆ `EmptyState kind="filtered"` | "No requests match your filter" |

### Table cells
| Column | Component | Rule |
|---|---|---|
| Method | ◆ `MethodBadge` | per-method tint |
| Status | ◆ `StatusCode` | **code only**; net error → "Error"; pending → ··· |
| Path | text, truncates | only truncating column |
| Elapsed | `fmtMs` (app) | never truncates |
| Size | ◆ `SizeCell` + ▣ `Tooltip` | response **wire** size + compression marker (`wire/decoded/enc`) |
| Time | `fmtClock` (app) | absolute `HH:MM:SS.mmm`, Local/UTC; never truncates |

## Inspector panel  → `inspector.tsx`

| Element | Component | Notes |
|---|---|---|
| Context bar | ◆ `ContextBar` | prev/next (▣ icon buttons), `MethodBadge size="md"`, colorized path+query, `StatusCode`, elapsed pill, `TraceTag`, "next matching" chevron |
| Tab strip | ⬡ `Tabs` underline | **Bodies · Headers · Timing** (one Headers tab) |
| msearch toggle | ⬡ `ToggleGroup` (Paired/Raw NDJSON) | right of tab strip, **Bodies tab only**, when `protocol==="msearch"` |
| Body split | ◆ two `JsonViewer` panes | media-type slug + ▣ `Tooltip`; size shown `wire / decoded (enc)` |
| msearch view | ◆ `msearch-view.tsx` (⬡ `Collapsible`) | numbered sub-cards 1:1; responses collapsed; click head = focus pair |
| Stream view | ◆ `stream-view.tsx` (⬡ `ToggleGroup`) | replaces response pane; events/transcript; play/pause; 4-state live; jump-to-latest |
| Headers | ◆ table, two columns | request + response side-by-side; **count in each pane subhead** |
| Timing | ◆ facts table | "HTTP version / Request bytes / Response bytes…"; **no waterfall** |
| Awaiting body | ▣ `Skeleton` / ◆ `BodyState` | lifecycle: awaiting-response vs awaiting-body |
| JSON body | ◆ `json-viewer.tsx` | your custom impl; uses `text-json-*` tokens |

## Status bar  `h-statusbar`, `bg-card`, top `border`

| Element | Component | Notes |
|---|---|---|
| Connection | ◆ connection dot + text | open/connecting/down |
| Upstream | text (mono) | upstream URL |
| Counts | text | `N traces` · `#<selectedId>` |
| Shortcuts hint | `<kbd>` "? shortcuts" | opens help |
| Dividers | ▣ `Separator` (vertical) / `·` | |

## Overlays

| Element | Component | Notes |
|---|---|---|
| Command palette | ◷ `Command` (cmdk) | **commands only** (grouping, theme, timezone, clear filter…); no per-exchange list |
| Copy / connection toast | ◷ `sonner` | copy confirmations, connection drops |
| Tooltips | ⬡ `Tooltip` | abbreviated media types, icon affordances |

## Atoms (used throughout)

| Atom | Component | Token source |
|---|---|---|
| Method badge | ◆ `MethodBadge` (cva) | `method-*` |
| Status code | ◆ `StatusCode` | `status` kinds |
| Trace tag/pill | ◆ `TraceTag` | `trace-*` + actions |
| Connection dot | ◆ | `ok`/`redirect`/`server` |
| Elapsed pill | ◆ | `secondary` + `border` |
| Kbd | text `<kbd>` | `secondary` |
