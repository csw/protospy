# protospy UI Design System (`docs/ui/design-system.md`)

**Status:** the conformance target for protospy's UI — a declarative specification of what
the UI is meant to be: which primitive backs each control, the token a surface draws on,
interaction-state rendering, the type scale, cursor, radius, and the shared component
inventory. It governs *how things look*, not *what exists or where it sits*.

This document states the target. The **rationale** (why each call was made, rejected
alternatives), the **migration plan** (`main`→target change inventory and sequencing), and
the **open appearance choices** awaiting ratification live in the v2.1 working documents in
Obsidian (`UI/v2.1/`): `design-system-decisions.md`, `design-system-change-inventory.md`, and
`design-system-visual-ab-queue.md`. The method authority for *how* to encode these idiomatically
is `docs/ui/frontend-conventions.md` (cited below as **[A]**).

---

## How to read this

- **§1 — Scope.** What this governs and what it leaves to `main`.
- **§2 — Semantic token & elevation layer.** The surface-elevation scale, accent semantics,
  the on-state language, the type scale, cursor, and radius.
- **§3 — Primitive set & selection rules.** The semantics→primitive→ARIA matrix and the
  per-primitive target.
- **§4 — Shared components & tokens.** The component and token inventory the system provides.

---

## §1. Scope

**In scope (this spec governs):** *how things look* — which primitive backs each control, the
token a surface draws on, interaction-state rendering, the type scale, cursor, radius,
hover/elevation treatments, and the shared component/token inventory.

**Left to `main` (out of scope):** *what exists, what it's called, where it sits* — app-shell
composition; the set/order/arrangement of bars and panes; table column sets, names, and order;
control *placement*; copy and labels; the trace-rail packing algorithm; the keyboard/mouse
interaction model; state shape; backend integration.

> Rule of thumb: *how a thing looks* → in scope; *what exists, what it's called, or where it
> sits* → out of scope.

---

## §2. Semantic token & elevation layer

Interaction states are expressed as **relative steps on a semantic elevation scale**, never as
absolute palette colours ([A §3]). Components reference the scale; they never re-pick palette
numbers. Hover/active states are authored as `bg-*` surface tokens, never as `bg-<palette>-NNN`.

### 2.1 Surface elevation scale (recessed ↔ raised)

Elevation is encoded as named surfaces, ordered as a scale; interaction states are transitions
on it.

| Token | Light / Dark | Role on the scale |
| --- | --- | --- |
| `bg` | `#fbfbfc` / `#0c0f14` | **Recessed canvas** — app base, list pane background, trace rail. |
| `bg-pane` | `#ffffff` / `#11151c` | **Raised surface on the canvas** — bars (top bar, list toolbar, context bar, status bar), pane heads & stream head, rows, body panes, filter input, tabs, popovers. |
| `bg-sub` | `#f4f5f7` / `#161b23` | **A recess cut into a pane** — segmented-control track, table header, headers section-titles, msearch head, elapsed pill, `kbd`. |
| `bg-hl` | `rgba(38,99,235,.07)` / `rgba(96,165,250,.10)` | **Transient tinted hover** — rows, list items, group heads, palette/menu items. |
| `bg-hover` | `rgba(15,23,42,.035)` / `rgba(255,255,255,.04)` | **Transient neutral hover** — controls (buttons, toggles). |
| `bg-active` | `#e8effc` / `rgba(96,165,250,.16)` | **Persistent selected surface** — selected row, selected stream event. |

The segmented-control **"on"** state is `bg-pane` raised on a `bg-sub` track — it reads as
*elevation relative to a recess*, not as a standalone "on" colour. A control's on-state is
therefore only legible when it rises from a recess; toolbar toggles on a `bg-pane` bar use the
`accent-soft` surface instead (2.3).

### 2.2 Accent semantics

The three accent tokens carry distinct, non-interchangeable meanings. Reserve each for its
meaning:

| Token | Value (light/dark) | Reserved meaning |
| --- | --- | --- |
| `accent` (`--color-accent`) | `#2563eb` / `#60a5fa` | **Structural accent** — focus ring (rendered as `focus-visible:ring-ring`, where `--color-ring` aliases `--color-border-focus` = `accent`; a *ring*, not a literal `border`), primary-button fill, tab underline, timing-waterfall fill, jump-to-latest pill, streaming caret, resize-handle hover, trace badge-dot. |
| `accent-soft` (`--color-accent-soft`) | `#dbeafe` / `rgba(96,165,250,.16)` | **The active-state *surface*** — the "on" background of a binary toggle / chip (2.3). |
| `accent-ink` (`--color-accent-ink`) | `#1d4ed8` / `#93c5fd` | **Emphasis/active *text* and a semantic *key* colour** — active toggle/chip text, query-param keys (context-bar path), header-name column, chip text, stream `message_delta` event-type label, trace-pill external-link hover. |

`accent` is **brand-structural only** — it is never a neutral hover/selected surface. The
vendored shadcn primitives' neutral-surface classes resolve to protospy's neutral elevation
tokens, matching the hand-rolled controls (controls → `bg-hover`; rows / list / menu / palette
items → `bg-hl`):

| Vendored primitive neutral surface | Token |
| --- | --- |
| `Button` `ghost` / `outline` hover | `hover:bg-bg-hover hover:text-ink` |
| `DropdownMenu` item focus / open — all variants (`Item`, `CheckboxItem`, `RadioItem`, `SubTrigger` incl. `data-[state=open]`) | `bg-bg-hl` / `text-ink` |
| `CommandItem` selected (`data-[selected=true]`) | `bg-bg-hl` / `text-ink` |
| `Dialog` close-button open (`data-[state=open]`) | `bg-bg-hl` |

### 2.3 On-state / interaction-state language

The on-state is a **coherent per-control-class system**, not one universal "on" treatment. Each
is encoded via relative elevation and **keyed off `aria-pressed` / `aria-checked` /
`aria-selected`, never `data-[state=…]`** — because Radix Tooltip/Popover/Dialog triggers
clobber `data-state` on `asChild`-wrapped toggles (the merged node carries the *outer*
primitive's `data-state`), and protospy's toolbar toggles are tooltip-wrapped. ARIA attributes
are written per-element by the owning primitive and don't get clobbered ([A §1.4a], the single
highest-leverage rule). Each treatment is centralized at its primitive.

| Control class | "On/active" treatment | Where it lives | Keyed off |
| --- | --- | --- | --- |
| **Binary icon/label toggle, chip** (trace-group toggle, filter chip) | `bg-accent-soft` + `text-accent-ink` (transparent border) | `toggleVariants` (`variant: default`) | `aria-pressed` |
| **Segmented control** — choose one of a small visible set (rows/table switch, transcript/events, time-zone Local/UTC) | raised `bg-pane` fill on a `bg-sub` track + a **theme-aware** elevation shadow (light `0 1px 1px rgba(0,0,0,.05)`, with a `dark:` override — see note); **no accent** | `toggleVariants` (`variant: segmented`) + `ToggleGroup type="single"` track = `bg-sub` | `aria-pressed` |
| **Tabs** (Inspector) | `text-ink` + 2px `accent` bottom-border underline + weight 500 (not a fill) | `TabsList variant="line"` / `TabsTrigger` | `data-[state=active]` — safe **only** because `TabsTrigger` is not `asChild`/tooltip-wrapped; verify at the call site, and if it ever is wrapped, re-key off `aria-selected` ([A §1.4a]) |
| **Selected row** (exchange list, stream event) | `bg-active`; URI → `ink` + weight 500; **2px `accent` left bar**; in-trace adds the 4px trace-colour bar | row component (`role=option`) | `aria-selected` |

**Primitive target (`toggle.tsx`):**

```ts
const toggleVariants = cva(
  "inline-flex items-center justify-center rounded text-ui-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // binary toggle / chip — accent-soft active surface
        default:
          "bg-transparent text-mid hover:bg-bg-hover hover:text-ink aria-pressed:bg-accent-soft aria-pressed:text-accent-ink",
        // segmented item — raised pane-on-recess fill, no accent.
        // Elevation shadow is theme-aware: the 5%-black light shadow is invisible on a
        // dark raised pane, so a dark override carries the cue there (see note below).
        segmented:
          "bg-transparent text-mid hover:text-ink aria-pressed:bg-bg-pane aria-pressed:text-ink aria-pressed:shadow-[0_1px_1px_rgba(0,0,0,.05)] dark:aria-pressed:shadow-[0_1px_2px_rgba(0,0,0,.35)]",
      },
      size: { default: "h-9 min-w-9 px-2", sm: "h-[22px] min-w-[22px] px-0", lg: "h-10 min-w-10 px-2.5" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
```

`ToggleGroup` used as a segmented control passes `variant="segmented"` to its items and sets
its own track to `bg-bg-sub` (the recess the raised fill rises from). Standalone `Toggle`
(toolbar icon toggles) uses `variant="default"` (accent-soft). The base sets no
`cursor-pointer` (2.5) and uses `rounded` (4px, 2.6).

> **Dark-mode elevation note.** The segmented "on" cue is primarily the `bg-pane`-on-`bg-sub`
> step; the drop shadow is a secondary reinforcement. The light value `0 1px 1px rgba(0,0,0,.05)`
> is invisible on a dark raised pane and points the wrong way, so the CVA carries a `dark:`
> override; a single hardcoded light shadow is never shipped to both themes. If a second surface
> needs the same shadow, promote it to a `--shadow-segment` token defined per theme.

> **Reliability note.** Radix `ToggleGroup` items expose both `data-state` on/off and
> `aria-pressed` (the underlying `Toggle` writes it, [A §2.2]). Keying off `aria-pressed` is
> robust whether or not the item is later wrapped in a tooltip — prefer it uniformly, and
> confirm `aria-pressed` renders on items (it is the load-bearing selector).

**Selection-bar width** is normalized to **2px** (`border-l-2`) across both rows and table
modes. The 4px trace-colour bar coexists with the 2px selection bar and must read distinctly.

### 2.4 Type scale & font tokens

| v2 name | Size | Token | Intended use |
| --- | --- | --- | --- |
| `text-ui` | 13px | `--text-ui` | default UI chrome / body text |
| `text-mono` | 12.5px | `--text-ui-mono` | mono body / data — JSON viewer, transcript |
| `text-sm` | 11.5px | `--text-ui-sm` | status codes, list mono text, controls, labels |
| `text-xs` | 10.5px | `--text-ui-xs` | tiny: table headers, meta, kbd, badges, counts |
| (per-element) | 13.5px | `--text-ctx-path` | context-bar path |

- **`--text-ui: 13px`** is the base size most default body/chrome surfaces adopt.
- **Token names keep the `ui-` prefix** (`--text-ui-xs/sm/mono`, `--text-ctx-path`) — the bare
  v2 names (`text-sm`/`text-xs`) would collide with Tailwind's own defaults; the prefix exists
  to avoid that.
- **Font-family tokens are idiomatic** — `--font-ui` (Inter) and `--font-mono` (JetBrains Mono),
  so the v4 `--font-*` namespace generates the conventional `font-ui` / `font-mono` utilities
  (not `--font-family-*` → the awkward `font-family-*`).
- **tailwind-merge registers the custom font tokens via the `theme` keys** ([A §4.2] — custom
  font-size/family tokens don't auto-merge; a correctness requirement). Mirror Tailwind v4's
  `@theme` namespaces 1:1 — sizes under `theme.text`, families under `theme.font`:
  `extend: { theme: { text: ["ui", "ui-xs", "ui-sm", "ui-mono", "ctx-path"], font: ["ui", "mono"] } }`.
  Prefer this over the lower-level `classGroups` form (the escape hatch for non-theme bespoke
  utilities).
- **Per-element exceptions** (genuine per-element values, no token): brand wordmark
  `text-[14.5px]`; command-palette **input** is 14px → Tailwind `text-sm` (the one place
  `text-sm` is correct); `kbd` 10.5px → `text-ui-xs`.
- **Density:** the dense list/table cells are mono `text-ui-sm` (11.5) and headers `text-ui-xs`
  (10.5); only chrome/body uses 13px.

### 2.5 Cursor affordance

Interactive elements use the **default cursor**, not `cursor-pointer`, on every control (the
`Toggle` base and all hand-rolled sites included).

> Tailwind v4 Preflight: *"Buttons now use `cursor: default` instead of `cursor: pointer` to
> match the default browser behavior."* shadcn's `new-york` components follow suit. protospy
> adopts the platform default and does not add the v3-restore base snippet.

### 2.6 Radius

- **Control radius = `rounded` (4px)** — icon buttons, the `Toggle` primitive base, and
  segmented-control items all share the one control radius. Use `rounded` (= `0.25rem` = 4px),
  not arbitrary `rounded-[3px]`/`rounded-[4px]` values.
- **Method badge:** 3px. **Pills:** `rounded-full` (999px). **Command palette:** 10px.

---

## §3. Primitive set & selection rules

### 3.1 Selection rule

**Pick a primitive by interaction semantics — the ARIA role/state implied — never by
appearance** ([A §2.1]):

> Any control that an existing `components/ui/` primitive can back **must** use that primitive
> (shrink it via `className`, e.g. `size-4`, rather than hand-rolling). Hand-rolling a
> `<button>`/`<input>`/`<span onClick>` that a primitive already provides loses focus rings,
> disabled states, and hover behavior. A raw element is correct only when **no** primitive
> matches the semantics (e.g. a full-width list **row** is a native `<button role=option>` —
> leave it).

**Semantics → primitive → ARIA** ([A §2.2], abbreviated):

| Interaction semantics | Primitive | Implied role / state |
| --- | --- | --- |
| Stateless action | `Button` / `<button>` | `role=button` |
| Navigate to URL/route | `<a>` (`Button asChild`) | `role=link` |
| Binary persistent on/off, immediate (toolbar toggle) | `Toggle` | `role=button` + `aria-pressed` |
| Choose exactly one of a small visible set | `ToggleGroup type="single"` | items `aria-pressed` |
| Choose many of a visible set | `ToggleGroup type="multiple"` | per-item `aria-pressed` |
| Mutually exclusive panels, one always visible | `Tabs` | `aria-selected` / `tabpanel` |
| Trigger a list of actions/commands | `DropdownMenu` | `role=menu`/`menuitem` |
| Command launcher (type to filter actions) | `Command` (cmdk) | combobox + listbox |
| Modal needing a decision | `Dialog` / `AlertDialog` | `role=dialog`/`alertdialog` |
| Transient non-interactive info on hover/focus | `Tooltip` (via `SimpleTooltip`) | `role=tooltip` |
| Text entry / search | `Input` (§4) | native `<input>` semantics |

> `Switch` and `Checkbox` are intentionally absent — see `design-system-decisions.md` (D8). The
> conventions matrix ([A §2.2–2.3]) carries them as first-class, so their omission is a recorded
> decision; an agent adding a settings/preferences surface should re-open the choice.

> A one-line semantic justification is required in a PR when a control's primitive isn't obvious
> — especially button-vs-`Toggle` (does it have persistent on/off state?) and action-vs-link.

### 3.2 Per-primitive target

| Primitive | Target |
| --- | --- |
| `Button` | Canonical for **all** control buttons. Ghost/outline hover → neutral `bg-bg-hover` (2.2). No `cursor-pointer`. |
| `Toggle` | Binary toolbar toggles. On-state `aria-pressed:bg-accent-soft` / `text-accent-ink` (2.3). No `cursor-pointer`; base radius `rounded`. |
| `ToggleGroup` | Segmented controls. Track `bg-bg-sub`; items `variant="segmented"` (raised-fill on-state). |
| `Tabs` (`line`) | Inspector tab strip. Active = 2px `accent` underline, carried by the `line` variant (call sites don't override). |
| `DropdownMenu` | Menus (service picker, actions). Focus/open → neutral `bg-bg-hl`. |
| `Command` (cmdk) | Command palette. Selected → `bg-bg-hl`. |
| `Dialog` | Modal backbone (palette). Close-button `data-[state=open]` surface → neutral `bg-bg-hl`. |
| `Tooltip` / `SimpleTooltip` | **`SimpleTooltip` is the single tooltip mechanism** — all tooltip and `title`-style hints use it. |
| `MethodBadge` | Token-clean; unchanged. |
| `EmptyState` | The single empty-state primitive — used by `EventsView` and `Command`'s `CommandEmpty`. |

---

## §4. Shared components & tokens

The system provides these shared components and tokens. (Each backs a real, on-screen need; no
component exists beyond what the UI renders.)

**Tokens:**

| Token | Role |
| --- | --- |
| `--text-ui: 13px` | base UI/body font size (completes the type scale, 2.4) |
| `--font-ui` / `--font-mono` | idiomatic font-family tokens → `font-ui` / `font-mono` (2.4) |
| tailwind-merge `theme.text` + `theme.font` registration | custom font tokens must be registered to merge correctly ([A §4.2]) |

No new *colour* tokens are required — the elevation scale and accent family (§2) cover the
system; the work is to *reserve* and *apply* them.

**Shared components:**

| Component | What it is |
| --- | --- |
| `Input` (shadcn) + `SearchInput` composite | icon + input + clear; the single search-box (FilterBar, HeadersPane) |
| `StatusDot` | state enum → dot, with `size` + `halo` variants (TopBar, StatusBar, LiveIndicator) |
| `PaneHeader` | the head-bar wrapper (`bg-pane`); single source for every pane/stream head |
| `JumpToLatestPill` | the jump-to-latest pill (StreamView, ChatStreamView) |
| `CopyButton` | the single copy affordance + success signal, on `Button variant="link" size="xs"`; resting `dim` |

**`StatusDot` variants:** the atom backs two visually distinct dots, so it takes `size` and
`halo` variants:

| Use | Size | Halo | States |
| --- | --- | --- | --- |
| **Connection dot** (`TopBar`, `StatusBar`) | `7px` | `3px` ring — `box-shadow: 0 0 0 3px <status>-bg` | open → `green`; connecting → `amber` + pulse; down → `red`. |
| **Live-indicator dot** (`LiveIndicator`) | `6px` | none | live → `green` + pulse; paused → `amber`, no animation. |

The `3px` halo is a `ring-3`/`box-shadow` on the status `-bg` token; the pulse is `animate-pulse`.
Both sizes are kept — collapsing the live-indicator dot to 7px or dropping the connection-dot
halo would diverge from intent.

**Event-type colour map** (`eventTypeBadgeClass`, tokenized — themes for dark mode):

| Event type | Token (text + `-bg`) |
| --- | --- |
| `message_start` | `purple` / `purple-bg` |
| `content_block_delta` | `green` / `green-bg` |
| `message_delta` | `accent-ink` (key colour, no fill) |
| `message_stop` | `mid` |
| `ping` | `dim` |
