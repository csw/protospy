# protospy UI Design System (`docs/ui/design-system.md`)

**Status:** authoring pass — spec + queued visual A/Bs, **no code changes** (PRO-319,
child of [PRO-316](https://linear.app/protospy/issue/PRO-316)). This is the top-down
target the execution chunks (Tech children of PRO-316) conform to.

**Audience:** the PM sequencing execution chunks, and the agents implementing them.
This document says *what the UI should be*; the per-surface inventory (§5) is the
hand-off list the PM turns into tickets, and the decision log (§7) records *why* so a
downstream agent that hits a bad fit flags it rather than conforming blindly.

---

## How to read this

- **§1 — Scope & precedence.** What this governs and what is frozen at `main`.
- **§2 — Semantic token & elevation layer.** The collapse point: the surface-elevation
  scale, accent semantics + the shadcn-accent collision resolution, the on-state
  language, the type scale, cursor, radius, and hover surfaces. The four folded
  decisions (on-state, accent, font tokens, cursor) are settled here.
- **§3 — Target primitive set + selection rules.** The generalized PRO-291 rule and the
  semantics→primitive matrix, plus the per-primitive target state.
- **§4 — Gaps.** Missing primitives/tokens to add — filling only real, on-screen needs.
- **§5 — Per-surface change inventory.** The enumerated hand-off list, with proposed
  execution chunks and the file-overlap sequencing that keeps them non-colliding.
- **§6 — Visual A/B queue.** The genuine appearance choices to render for Clayton to
  ratify. Everything not here is decided-with-rationale.
- **§7 — Decision log.** Rationale + selection criteria per call.

### Inputs consumed (not re-derived)

| Ref | Document | Role |
| --- | --- | --- |
| **[A]** | `docs/ui/frontend-conventions.md` (PRO-317) | The *method* — Radix usage depth, the semantics→primitive→ARIA matrix, the relative-elevation token model, CVA + tailwind-merge rules. How to encode idiomatically. |
| **[B]** | `~/obsidian/protospy/UI/v2.1/component-inventory.md` (PRO-318) | What the UI does **today** on `main` — component→primitive→token usage and the §5 inconsistency catalogue. |
| **[V]** | `~/obsidian/protospy/UI/v2.1/v2-style-reference.md` | The **style-only** v2 design intent — type scale, colour tokens, elevation model, on-state language, accent semantics, per-element treatments. The design-intent authority for resolving B's *visual* inconsistencies. |
| **[X]** | `~/obsidian/protospy/UI/v2.1/v2-match-notes.md` | Independent current-vs-intent cross-check (corroboration + one logged elevation correction). |
| — | PRO-285 idiom audit (`Claude/Reviews/PRO-285-tailwind-shadcn-idiom-audit.md`) | Conversion sequencing & site-level findings (F1–F8). Background. |

Token values cited below are verified against `ui/src/theme/tailwind.css` and the
vendored primitives in `ui/src/components/ui/` at the time of writing.

---

## §1. Scope & precedence

**In scope (this spec governs):** *how things look* — which primitive backs each
control, the token a surface draws on, interaction-state rendering, the type scale,
cursor, radius, hover/elevation treatments, and which gaps (primitives/tokens) to fill.

**Frozen at current `main` (do NOT reconcile against the v2 handoff):** *what exists,
what it's called, where it sits* — app-shell composition; the set/order/arrangement of
bars and panes; **table column sets, names, and order**; control *placement*; copy and
labels; the trace-rail packing algorithm; keyboard/mouse interaction model; state shape;
backend integration. [V §9].

> Rule of thumb (from [V]): *how a thing looks* → in scope; *what exists, what it's
> called, or where it sits* → out of scope, `main` wins, no comparison.

**Precedence when sources disagree:**

1. **Frozen-at-`main` structure** always wins over the handoff (the handoff's column
   layout, for instance, is stale vs `main`).
2. For *visual* questions: **[V] abstract token block** (type scale, colour tokens) is
   authoritative for *values*; **[V] `styles.css` realisations** fill per-element values
   the abstract block omits; on contradiction, **design intent + codebase idiom win over
   prototype specifics** (prefer the idiomatic shadcn/Tailwind realisation of the intent
   over a literal port of hand-written CSS).
3. **[A] is the method authority** — when [V] says *what* a state should look like, [A]
   says *how* to encode it (relative elevation, ARIA-keyed styling, CVA, tailwind-merge).

---

## §2. Semantic token & elevation layer

This is where the folded decisions collapse into one vocabulary. Interaction states are
expressed as **relative steps on a semantic elevation scale**, never as absolute palette
colours [A §3]. Components reference the scale; they never re-pick palette numbers.

### 2.1 Surface elevation scale (recessed ↔ raised)

protospy already encodes elevation as named surfaces. Treat these as an ordered scale and
define interaction states as transitions on it. Values per [V §2a, §5] (corrected by [X]
for the `bg-pane`-vs-`bg-sub` cases).

| Token | Light / Dark | Role on the scale |
| --- | --- | --- |
| `bg` | `#fbfbfc` / `#0c0f14` | **Recessed canvas** — app base, list pane background, trace rail. |
| `bg-pane` | `#ffffff` / `#11151c` | **Raised surface on the canvas** — bars (top bar, list toolbar, context bar, status bar), **pane heads & stream head**, rows, body panes, **filter input**, tabs, popovers. |
| `bg-sub` | `#f4f5f7` / `#161b23` | **A recess cut into a pane** — segmented-control track, table header, headers section-titles, msearch head, elapsed pill, `kbd`. |
| `bg-hl` | `rgba(38,99,235,.07)` / `rgba(96,165,250,.10)` | **Transient tinted hover** — rows, list items, group heads, palette/menu items. |
| `bg-hover` | `rgba(15,23,42,.035)` / `rgba(255,255,255,.04)` | **Transient neutral hover** — controls (buttons, toggles). |
| `bg-active` | `#e8effc` / `rgba(96,165,250,.16)` | **Persistent selected surface** — selected row, selected stream event. |

**Load-bearing consequence — the segmented "on" fill.** v2's segmented-control "on" state
is **`bg-pane` raised on a `bg-sub` track** [V §5, §6]: it reads as *elevation relative to
a recess*, not as a standalone "on" colour. On a `bg-pane` bar with no recess to rise
from, the same fill loses contrast — which is exactly the current on-state bug (see 2.3).

**Elevation corrections to apply** (current `main` diverges from intent — [X] correction):
pane heads, the stream head, the filter input, and the status bar are **`bg-pane`** in the
intent; current code recesses several to `bg-sub`. Resolve **toward `bg-pane`**. Only the
segmented track, table header, section titles, msearch head, elapsed pill, and `kbd` are
`bg-sub`.

> Note: the absolute hex values above are themselves the v2 palette and are already
> correct in `tailwind.css` — this scale is a *naming/role* contract, not a re-coloring.
> Hover/active states must be authored as `bg-*` surface tokens, never as `bg-<palette>-NNN`.

### 2.2 Accent semantics + the shadcn-accent collision (folds PRO-310)

**The three accent tokens carry distinct, non-interchangeable meanings** [V §7]. Reserve
each for its meaning:

| Token | Value (light/dark) | Reserved meaning |
| --- | --- | --- |
| `accent` (`--color-accent`) | `#2563eb` / `#60a5fa` | **Structural accent** — focus border (`border-focus`), primary-button fill, tab underline, timing-waterfall fill, jump-to-latest pill, streaming caret, resize-handle hover, trace badge-dot. |
| `accent-soft` (`--color-accent-soft`) | `#dbeafe` / `rgba(96,165,250,.16)` | **The active-state *surface*** — the "on" background of a binary toggle / chip (2.3). |
| `accent-ink` (`--color-accent-ink`) | `#1d4ed8` / `#93c5fd` | **Emphasis/active *text* and a semantic *key* colour** — active toggle/chip text, query-param keys (context-bar path), header-name column, chip text. |

**The collision.** protospy's `@theme` defines `--color-accent` as the **brand blue**.
The vendored primitives' stock shadcn classes use `accent` to mean a **neutral interactive
hover surface**: `Button` `ghost`/`outline` `hover:bg-accent hover:text-accent-foreground`,
`DropdownMenu` `focus:bg-accent`, `Command` `data-[selected=true]:bg-accent`. Because
there is exactly one `--color-accent` token, those `bg-accent` utilities currently render
**protospy's brand blue** as the hover/selected surface — not a neutral. App code
compensates by overriding ghost hover back to `bg-bg-hover` at *every* ContextBar call
site ([B §5.4]). One token name is being asked to mean two things.

**Resolution — Path A (recommended): keep `accent` = brand; give the primitives a neutral
surface.** Repoint the vendored primitives' neutral-surface classes onto protospy's
neutral elevation tokens, matching what hand-rolled controls already do [V §6: "Hover —
controls → `bg-hover`; rows / list items / palette items → `bg-hl`"]:

| Vendored primitive class (today) | Target |
| --- | --- |
| `Button` `ghost`/`outline` `hover:bg-accent hover:text-accent-foreground` | `hover:bg-bg-hover hover:text-ink` |
| **all** `DropdownMenu` item variants — `DropdownMenuItem` (L75), `DropdownMenuCheckboxItem` (L93), `DropdownMenuRadioItem` (L129), `DropdownMenuSubTrigger` (L212) — `focus:bg-accent focus:text-accent-foreground` (+ SubTrigger's `data-[state=open]:bg-accent …`) | `focus:bg-bg-hl focus:text-ink` (+ `data-[state=open]:bg-bg-hl …`) |
| `CommandItem` `data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground` | `data-[selected=true]:bg-bg-hl data-[selected=true]:text-ink` |
| `Dialog` close button (`dialog.tsx` L71) `data-[state=open]:bg-accent` | `data-[state=open]:bg-bg-hl` |

> **Enumerate every site.** `bg-accent` / `text-accent-foreground` (shadcn's neutral-surface
> usage) appears in **all four** `DropdownMenu` item variants and the `Dialog` close button,
> not just `DropdownMenuItem`. Missing the checkbox/radio/sub-trigger variants would leave
> those menu rows rendering brand-blue on focus/open — the exact bug D2 kills — and leave
> `text-accent-foreground` live.

This **removes the per-call-site overrides** (closes [B §5.4]), frees `accent` to mean only
"brand structural accent," and reserves `accent-soft`/`accent-ink` for their state/text
meanings above. The `@theme inline` `--color-accent-foreground → ink` alias becomes
vestigial **only once every `text-accent-foreground` reference above is repointed** — drop
it after the last one is gone (within the T2 chunk), not before, or the remaining menu
items lose their foreground colour.

**Path B (rejected, recorded):** introduce a new `--color-brand` for the structural accent
and let `accent` revert to a neutral shadcn surface. Semantically "purest" (frees the
`accent` name for shadcn's meaning) but churns *every* `bg-accent`/`text-accent`/
`border-accent` brand call site across app code — far higher risk for no user-visible gain.
Rejected on churn-vs-benefit. See §7-D2.

> This is a token/code decision, not an appearance choice: v2's intent for control hover
> is explicitly the neutral `bg-hover` [V §6], so the *rendered* result is the intended
> one. No A/B needed.

### 2.3 On-state / interaction-state language (folds PRO-312 + PRO-313)

v2 has a **coherent per-control-class system** — not one universal "on" treatment [V §6].
Encode each via [A]'s relative-elevation method, **keyed off `aria-pressed` /
`aria-checked` / `aria-selected`, never `data-[state=…]`** — because Radix Tooltip/Popover/
Dialog triggers clobber `data-state` on `asChild`-wrapped toggles (the merged node carries
the *outer* primitive's `data-state`), and protospy's toolbar toggles are tooltip-wrapped.
ARIA attributes are written per-element by the owning primitive and don't get clobbered
([A §1.4a], the single highest-leverage rule). **Centralize each at its primitive.**

| Control class | "On/active" treatment (v2 intent) | Where it lives | Keyed off |
| --- | --- | --- | --- |
| **Binary icon/label toggle, chip** (trace-group toggle, filter chip) | `bg-accent-soft` + `text-accent-ink` (transparent border) | `toggleVariants` (`variant: default`) | `aria-pressed` |
| **Segmented control** (rows/table switch, transcript/events) | **raised `bg-pane` fill on a `bg-sub` track** + subtle shadow `0 1px 1px rgba(0,0,0,.05)`; **no accent** | `toggleVariants` (`variant: segmented`) + `ToggleGroup` track = `bg-sub` | `aria-pressed` |
| **Tabs** (Inspector) | `text-ink` + 2px `accent` **bottom-border underline** + weight 500 (not a fill) | `TabsList variant="line"` / `TabsTrigger` | `data-[state=active]` (not `asChild`-wrapped — safe) |
| **Selected row** (exchange list, stream event) | `bg-active`; URI → `ink` + weight 500; **2px `accent` left bar**; in-trace adds the 4px trace-colour bar | row component (`role=option`) | `aria-selected` |

**The current bug this fixes.** `toggleVariants` today is
`data-[state=on]:bg-bg-pane data-[state=on]:text-ink` — both the wrong *key*
(`data-[state=on]` is clobbered on tooltip-wrapped toggles) and the wrong *value*
(`bg-bg-pane` is invisible on a `bg-pane` toolbar — [A]'s named absolute-on-state
anti-pattern, [B §5.3]).

**Concrete primitive target (`toggle.tsx`):**

```ts
const toggleVariants = cva(
  "inline-flex items-center justify-center rounded-md text-ui-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // binary toggle / chip — accent-soft active surface
        default:
          "bg-transparent text-mid hover:bg-bg-hover hover:text-ink aria-pressed:bg-accent-soft aria-pressed:text-accent-ink",
        // segmented item — raised pane-on-recess fill, no accent
        segmented:
          "bg-transparent text-mid hover:text-ink aria-pressed:bg-bg-pane aria-pressed:text-ink aria-pressed:shadow-[0_1px_1px_rgba(0,0,0,.05)]",
      },
      size: { default: "h-9 min-w-9 px-2", sm: "h-[22px] min-w-[22px] px-0", lg: "h-10 min-w-10 px-2.5" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
```

`ToggleGroup` used as a segmented control passes `variant="segmented"` to its items and
sets its own track to `bg-bg-sub` (the recess the raised fill rises from). Standalone
`Toggle` (toolbar icon toggles) uses `variant="default"` (accent-soft). Note `cursor-pointer`
is **removed** from the base — see 2.5.

> **Reliability note.** Radix `ToggleGroup` items expose `data-state` on/off (confirmed
> via Radix docs) and `aria-pressed` (per [A §2.2], the underlying `Toggle` writes it).
> Keying off `aria-pressed` is robust whether or not the item is later wrapped in a
> tooltip; prefer it uniformly. Verify `aria-pressed` is present on rendered items in the
> execution chunk's browser test (it is the load-bearing selector).

**Selection bar width** is normalized — currently `border-l-4` (rows) vs `border-l-[3px]`
(table); v2 intent is **2px** [V §6]. → see the A/B in §6 (the one place a real-data-list
scannability call differs from the style-only prototype).

### 2.4 Type scale & font-size tokens (folds PRO-300)

This is **recover-and-apply**, not an open "which size" — the v2 scale is recovered in
[V §1] and the four current tokens already match it. The task is to (a) **add the one
missing token** and (b) **apply the scale consistently** (today the bespoke tokens are
used ~13 sites vs ~73 for Tailwind defaults — [PRO-285 F7]).

| v2 name | Size | Token | Status | Intended use |
| --- | --- | --- | --- | --- |
| `text-ui` | **13px** | **`--text-ui` (NEW)** | **missing — add** | default UI chrome / body text |
| `text-mono` | 12.5px | `--text-ui-mono` | exists, unused | mono body / data — **JSON viewer, transcript** |
| `text-sm` | 11.5px | `--text-ui-sm` | exists | status codes, list mono text, controls, labels |
| `text-xs` | 10.5px | `--text-ui-xs` | exists | tiny: table headers, meta, kbd, badges, counts |
| (per-element) | 13.5px | `--text-ctx-path` | exists | context-bar path |

**Decisions:**

- **Add `--text-ui: 13px`** to `@theme` — the missing base. This completes the scale and
  is the size most "default body/chrome" surfaces should adopt (they currently sit on
  Tailwind `text-xs` 12px / `text-sm` 14px, both *wrong* vs intent).
- **Keep the existing token names** (`--text-ui-xs/sm/mono`, `--text-ctx-path`) — they
  already match v2 sizes; renaming would churn for no gain.
- **Register all `--text-*` keys with tailwind-merge** ([A §4.2] — custom font-size tokens
  do **not** auto-merge; this is a correctness bug, not a nicety). The `extendTailwindMerge`
  call in `lib/utils.ts` must list `["ui", "ui-xs", "ui-sm", "ui-mono", "ctx-path"]` under
  `theme.text`. Add `"ui"` when the token lands.
- **Per-element exceptions that stay arbitrary** (genuine per-element values in [V §1],
  no token): brand wordmark `text-[14.5px]`; command-palette **input** is genuinely **14px**
  → use Tailwind `text-sm` (14px exactly — the one place `text-sm` is correct); `kbd`
  10.5px → `text-ui-xs`.
- **Density:** the dense list/table does **not** regress — per [V §8] table cells are mono
  `text-ui-sm` (11.5) and headers `text-ui-xs` (10.5); only *chrome/body* moves to 13px.

A per-surface mapping table is in §5. Where a surface's current size is ambiguous, §5
states the target token.

### 2.5 Cursor affordance (folds PRO-314 — decided by Clayton)

**Decision: follow the shadcn / Tailwind v4 no-pointer default.** Interactive elements use
the **default cursor**, not `cursor-pointer`.

> Tailwind v4 upgrade guide, Preflight changes — *"Buttons now use `cursor: default`
> instead of `cursor: pointer` to match the default browser behavior."* shadcn's
> `new-york` components followed suit (no `cursor-pointer` in `button.tsx` base). We adopt
> the platform default and **do not** add the v3-restore base snippet.

Normalize:

- **Remove `cursor-pointer`** from `toggleVariants` base (it's there today).
- **Remove `cursor-pointer`** from hand-rolled call sites (FilterBar clear, JsonViewer
  expandable rows, ChatStreamView segments, FilterBar clear-trace, etc.).
- `Button` base is already correct (no `cursor-pointer`) — leave it. `CommandItem` /
  `DropdownMenuItem` already use `cursor-default` — leave them.

Rationale: matching the OS/browser default is the convention the whole ecosystem moved to;
a keyboard-driven app gains nothing from a pointer cursor on every control, and the
inconsistency (some controls pointer, some not) is itself a defect. See §7-D4.

### 2.6 Radius & misc normalizations

- **Control radius = `radius-sm` (4px).** v2 intends icon buttons at 4px [V §8]; TopBar's
  `iconBtnClass` uses `rounded-md` (6px) — the outlier ([B §5.9], [X]). Normalize toolbar
  icon controls to `rounded` (Tailwind `rounded` = 4px). ContextBar already overrides to
  4px. Method badge stays `3px`; pills stay `999px` (`rounded-full`); command palette stays
  `10px` — all match v2.
- **`rounded-[4px]` is a no-op** — Tailwind `rounded` is already `0.25rem` = 4px. Replace
  the arbitrary value with `rounded` ([PRO-285 F6]).
- **Opacity-on-token dimmers** (`text-red/60` on error icons — [B §5.12]) → keep the
  semantic token at full strength, or introduce a dedicated dimmer only if a real second
  need appears (do not invent now). Low priority.
- **Icon sizing** ([B §5.13]) — prefer the `size-*` utility (`size-3`, `size-3.5`) over raw
  numeric `size={13}` props for consistency with the `Button`/`Toggle` `[&_svg]` rules.
  Mechanical, low priority.

---

## §3. Target primitive set + selection rules

### 3.1 The selection rule (generalizes PRO-291)

**Pick a primitive by interaction semantics — the ARIA role/state implied — never by
appearance** [A §2.1]. The generalized PRO-291 rule:

> Any control that an existing `components/ui/` primitive can back **must** use that
> primitive (shrink it via `className`, e.g. `size-4`, rather than hand-rolling). Hand-
> rolling a `<button>`/`<input>`/`<span onClick>` that a primitive already provides loses
> focus rings, disabled states, and hover behavior, and is the recurring failure mode here
> ([B §5.2], [PRO-285 F1]). A raw element is correct only when **no** primitive matches the
> semantics (e.g. a full-width list **row** is a native `<button role=option>` — leave it).

**Semantics → primitive → ARIA** (the canonical reference — [A §2.2], abbreviated):

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
| Text entry / search | `Input` (**to add** — §4) | native `<input>` semantics |

> One-line semantic justification is required in a PR when a control's primitive isn't
> obvious — especially button-vs-`Toggle` (does it have persistent on/off state?) and
> action-vs-link.

### 3.2 Per-primitive target state

| Primitive | Target | Change vs today |
| --- | --- | --- |
| `Button` | Canonical for **all** control buttons. Ghost/outline hover → neutral `bg-bg-hover` (2.2). No `cursor-pointer` (already). | Repoint ghost/outline hover off `bg-accent`. |
| `Toggle` | Binary toolbar toggles. On-state `aria-pressed:bg-accent-soft` (2.3). No `cursor-pointer`. | Rewrite on-state key+value; drop cursor. |
| `ToggleGroup` | Segmented controls. Track `bg-bg-sub`; items `variant="segmented"` (raised-fill on-state). | Add segmented variant + recessed track. |
| `Tabs` (`line`) | Inspector tab strip. Active = 2px **`accent`** underline (move the accent into the `line` variant so call sites stop overriding). | Use `accent` underline in the primitive, not `after:bg-foreground`. |
| `DropdownMenu` | Menus (service picker, actions). Focus → neutral `bg-bg-hl`. | Repoint focus off `bg-accent`. |
| `Command` (cmdk) | Command palette. Selected → `bg-bg-hl`. | Repoint selected off `bg-accent`. |
| `Dialog` | Modal backbone (palette). Close-button `data-[state=open]` surface → neutral `bg-bg-hl`. | Repoint close button off `bg-accent` (P9). |
| `Tooltip` / `SimpleTooltip` | **`SimpleTooltip` is the single tooltip mechanism.** Migrate TopBar's raw `Tooltip`/`TooltipTrigger`/`TooltipContent` and native `title` controls to `SimpleTooltip` ([B §5.6]). | Consolidate. |
| `MethodBadge` | Keep — already token-clean ([B §4]). | None. |
| `EmptyState` | The single empty-state primitive — adopt in `EventsView` and `Command`'s `CommandEmpty` ([B §5.8]). | Adopt at the two hand-rolled sites. |

---

## §4. Gaps — primitives & tokens to add

Fill **only real, on-screen needs** — no inventing components beyond what the current UI
already renders.

**Tokens:**

| Add | Why | Real need |
| --- | --- | --- |
| `--text-ui: 13px` | Completes the v2 type scale; the base-body size has no current token (2.4). | ~73 default-body surfaces sit on the wrong Tailwind default today. |
| (tailwind-merge) register `text.ui` key | Custom font-size tokens don't auto-merge ([A §4.2]); a correctness bug. | Needed the moment `--text-ui` is consumed via `cn()`. |

No new *colour* tokens are needed — the elevation scale and accent family already exist;
the work is to *reserve* and *apply* them (§2), not extend them.

**Primitives / shared components** (each backed by a current duplication):

| Add | Replaces | Sites today | Real need |
| --- | --- | --- | --- |
| `Input` (shadcn) + `SearchInput` composite (icon + input + clear) | byte-for-byte duplicated raw search-box shell | `FilterBar`, `HeadersPane` ([B §5.2], [PRO-285 F2/F8]) | 2 verbatim copies; raw `<input>` has no primitive. |
| `StatusDot` (state enum → dot) | duplicated `w-[7px] h-[7px] rounded-full bg-* [animate-pulse]` | `TopBar`, `StatusBar`, `LiveIndicator` ([B §5.10], [PRO-285 F8]) | 3 copies of the same atom. |
| `PaneHeader` (head bar wrapper) | duplicated `flex items-center h-[30px] bg-* border-b` | `BodyPane`, `StreamView`, `ChatStreamView`, `HeadersSplit`, `ExchangeList` ([PRO-285 F8]) | 5 copies; also the surface to apply the `bg-pane` elevation correction (2.1) once. |
| `JumpToLatestPill` | duplicated jump pill | `StreamView`, `ChatStreamView` ([B §5.10]) | verbatim duplicate. |
| `CopyButton` (consolidate onto `Button`) | 3 independent copy impls | `CopyButton` (text), `HeadersPane` per-row (icon), + adopt `Button variant="link"`/`ghost` | one affordance + success signal, not three ([B §5.5]). |

`eventTypeBadgeClass` is **not** a new primitive but must be **tokenized** — replace raw
`text-purple-500 bg-purple-500/10` / `bg-green-500/10` with the semantic `purple`/`green`
(+`-bg`) tokens that theme for dark mode ([B §5.11], [PRO-285 F3]; absorbs PRO-272).

---

## §5. Per-surface change inventory (hand-off list)

Each row is a discrete change. The **Chunk** column proposes the execution-ticket grouping;
§5.x below sequences them for non-collision.

### 5.1 Vendored primitives — the foundation

| # | File | Change | Chunk |
| --- | --- | --- | --- |
| P1 | `theme/tailwind.css` | Add `--text-ui: 13px`. Resolve accent collision: drop the `--color-accent-foreground` alias **only after** P5–P8 repoint every `text-accent-foreground` site (do it in T2, with P5–P8, not in T1). | **T1** |
| P2 | `lib/utils.ts` | `extendTailwindMerge` register `text.ui`. | **T1** |
| P3 | `components/ui/toggle.tsx` | On-state → `aria-pressed:bg-accent-soft/text-accent-ink`; add `segmented` variant; remove `cursor-pointer`; rest text `text-mid`. | **T2** |
| P4 | `components/ui/toggle-group.tsx` | Segmented track `bg-bg-sub`; pass `variant="segmented"` to items. | **T2** |
| P5 | `components/ui/button.tsx` | Ghost/outline hover → `bg-bg-hover hover:text-ink` (neutral). | **T2** |
| P6 | `components/ui/tabs.tsx` | `line` variant active underline uses `accent` (2px). | **T2** |
| P7 | `components/ui/dropdown-menu.tsx` | **All** item variants' `focus:bg-accent focus:text-accent-foreground` → `bg-bg-hl`/`text-ink`: `DropdownMenuItem` (L75), `CheckboxItem` (L93), `RadioItem` (L129), `SubTrigger` (L212, incl. `data-[state=open]:bg-accent`). | **T2** |
| P8 | `components/ui/command.tsx` | `CommandItem` selected `data-[selected=true]:bg-accent/text-accent-foreground` → `bg-bg-hl`/`text-ink`. | **T2** |
| P9 | `components/ui/dialog.tsx` | Close-button `data-[state=open]:bg-accent` (L71) → `bg-bg-hl`. | **T2** |

### 5.2 App surfaces

| # | Surface / file | Change | Chunk |
| --- | --- | --- | --- |
| A1.1 | `TopBar` — trace-group toggle | Hand-rolled `<button>` → `Toggle` (accent-soft on-state via primitive); drop manual `aria-pressed` styling. | A1 |
| A1.2 | `TopBar` — density / theme cycle | Hand-rolled `<button>` → `Button variant="ghost" size="icon-xs"` (mode-cycle: icon conveys state, no persistent fill — §7-D1). | A1 |
| A1.3 | `TopBar` — service-picker trigger, "Jump to…" | → `Button` (`outline`/`secondary` `size="sm"`). | A1 |
| A1.4 | `TopBar` | Radius `rounded-md` → `rounded` (4px); raw `Tooltip` → `SimpleTooltip`; adopt `StatusDot`; font tokens. | A1 |
| A2.1 | `FilterBar` + `HeadersPane` — search box | Extract/adopt `SearchInput` (+ shadcn `Input`); clear `X` → `Button ghost icon-xs`. | A2 |
| A2.2 | `HeadersPane` — decode toggle | → `Button variant="outline" size="xs"` (or `Toggle` if persistent). | A2 |
| A2.3 | `HeadersPane` — per-row copy | → consolidated `CopyButton`. | A2 |
| A2.4 | `FilterBar` — trace chip | Keep `bg-accent-soft`/`text-accent-ink` (chip = active-surface meaning, correct); remove `cursor-pointer` on clear. | A2 |
| A3.1 | `ExchangeList` — rows/table switch | Already `ToggleGroup`; gets segmented track+on-state free from P4. Verify `bordered` + `bg-sub` track render. | A3 |
| A3.2 | `ExchangeList` — order toggle | → `Toggle` (binary newest/oldest → `aria-pressed`) **or** `Button` if treated as cycle (§7-D1); pick `Toggle`. | A3 |
| A3.3 | `ExchangeList` — local/UTC toggle | → `Toggle` (binary; on = `accent-soft`, replacing color-only `text-accent`). | A3 |
| A3.4 | `ExchangeList` / `ExchangeListItem` — selection bar | Normalize to **2px** accent left bar (see A/B §6.1); font tokens (status `text-ui-sm`, meta `text-ui-xs`, path → `text-ui`). | A3 |
| A4.1 | `ChatStreamView` — transcript/events segmented control | Hand-rolled pair → `ToggleGroup type="single"` (segmented on-state from P4). | A4 |
| A4.2 | `StreamView` + `ChatStreamView` — jump pill | → shared `JumpToLatestPill`. | A4 |
| A4.3 | `EventsView` | `eventTypeBadgeClass` tokenize (purple/green tokens); empty state → `EmptyState`. | A4 |
| A5.1 | `Inspector` — tab strip | Drop the `tabTriggerClass` accent-underline override once P6 moves accent into the `line` variant; font tokens. | A5 |
| A5.2 | `BodyPane`/`StreamView`/`HeadersSplit`/`ChatStreamView`/`ExchangeList` — pane heads | Adopt `PaneHeader`; apply `bg-pane` elevation correction (2.1); not-uppercase title weight 600 `ink-2` [V §8]. | A5 |
| A5.3 | `JsonViewer` | Body font → `text-ui-mono` (12.5); chevron already `Button` (model citizen — keep). | A5 |
| A5.4 | `CopyButton` (shared) | Consolidate onto `Button variant="link" size="xs"`; resting `dim` per [V §8] (not `accent`). | A5 |
| A6.1 | `CommandPalette` | `CommandEmpty` → `EmptyState`; selected surface from P8; input stays `text-sm` (14px, correct); font tokens for headings/items. | A6 |

Display-only surfaces (`StatusBar`, `TimingView`, `LiveIndicator`, `StreamErrorBanner`,
`BodySplit`) need only token/elevation alignment, folded into the nearest chunk.

### 5.3 Execution-chunk sequencing & file overlaps

**Dependency order (must respect):**

1. **T1 (tokens)** — `theme/tailwind.css`, `lib/utils.ts`. **Lands first.** Everything
   that uses `--text-ui` or the de-collided accent depends on it.
2. **T2 (primitives)** — all `components/ui/*`. **Lands after T1.** A1–A6 adopt the
   updated primitives, so T2 precedes them.
3. **A1–A6 (app surfaces)** — depend on T2; otherwise touch **disjoint files** and can
   run in parallel **except** for the overlaps below.

**File-overlap collisions to sequence (do not run these in parallel on the same branch):**

| Overlap | Chunks | Resolution |
| --- | --- | --- |
| `lib/utils.ts` | **T1** (twMerge) **+ A4** (`eventTypeBadgeClass`) | Land A4's `lib/utils.ts` edit after T1, or fold `eventTypeBadgeClass` tokenization into T1. |
| `StreamView.tsx`, `ChatStreamView.tsx` | **A4** (segmented + jump pill) **+ A5** (PaneHeader) | Sequence A5 after A4, or move all StreamView/ChatStreamView edits into one chunk. |
| `ExchangeList.tsx` | **A3** (toolbar, selection) **+ A5** (PaneHeader at list head) | Sequence A5 after A3 for this file, or carve the list-head PaneHeader edit into A3. |
| `HeadersPane.tsx` / `FilterBar.tsx` | **A2** (SearchInput) — self-contained | None — A2 owns both files. |

Recommended order: **T1 → T2 → {A1, A2, A6 in parallel} → A3 → A4 → A5** (A5 last because
`PaneHeader` reaches into files A3/A4 also touch). New shared components (`SearchInput`,
`StatusDot`, `PaneHeader`, `JumpToLatestPill`) are created in the chunk that first needs
them and live under `components/ui/` (or `components/` for app-composite) per existing
convention.

---

## §6. Visual A/B queue

The genuine appearance choices — where the **style-only** v2 extract can't settle it
because the call depends on protospy's *real* density/data (which the prototype didn't
have). These are queued as **renders for Clayton to ratify**, not abstract questions.
Everything else in this spec is decided-with-rationale. Each render should be captured at
1280 + 1440 in both themes against the noted fixture-matrix cell.

### A/B-1 — Binary toggle "on" fill intensity (TopBar)

**Where:** TopBar trace-group toggle (and any future toolbar binary toggle), active.
**Why it's a choice:** v2's `.icon-btn.active` is a full `bg-accent-soft` tinted fill
+ `accent-ink` icon [V §6]. protospy's toolbars are denser than the v2 prototype and can
sit several controls side by side; a full tinted fill on each active toggle may read loud.

| Option | Treatment | Note |
| --- | --- | --- |
| **A (recommended)** | `bg-accent-soft` surface + `text-accent-ink` icon (v2 literal) | Matches intent; unambiguous "on". |
| B | `text-accent-ink` icon only, no fill (or a hairline `border-accent/30`) | Lighter; relies on colour alone — weaker affordance. |

**Fixture:** a scene with the trace-group toggle active in the TopBar. Recommend **A**
unless the fill reads heavy on the real toolbar.

### A/B-2 — Selected-row accent-bar width (exchange list)

**Where:** selected row in both rows and table modes.
**Why it's a choice:** v2 specifies a **2px** accent left bar [V §6]; current `main` uses
**4px** (rows) / **3px** (table). On protospy's long, dense, scannable list a heavier bar
aids at-a-glance scanning — a real-data tradeoff the style-only extract didn't face.

| Option | Width | Note |
| --- | --- | --- |
| **A (recommended)** | **2px** (`border-l-2`) — v2 intent | Subtler; resolves the rows-vs-table inconsistency toward intent. |
| B | 3px | Middle ground; matches current table. |
| C | 4px | Most scannable; matches current rows. |

**Fixture:** a selected exchange in both rows and table modes, with and without a trace
bar present (the 4px trace-colour bar coexists with the selection bar — check they read
distinctly). Recommend **A** but render all three since the prototype was never this dense.

> No other open decision required an A/B — the v2 extract (§6/§8) is explicit enough that
> the remaining calls are decided-with-rationale in §7.

---

## §7. Decision log

Rationale + selection criteria per call, so a downstream agent that hits a bad fit can
flag it rather than conform blindly.

**D1 — On-state language: per-control-class, ARIA-keyed, centralized at the primitive.**
*Criteria:* match v2's coherent per-class intent [V §6]; encode via relative elevation
[A §3]; survive `asChild`/tooltip composition [A §1.4a]. *Call:* binary toggles/chips →
`accent-soft` surface keyed off `aria-pressed`; segmented → raised `bg-pane`-on-`bg-sub`
fill keyed off `aria-pressed`; tabs → `accent` underline (`data-[state=active]`, safe —
not `asChild`-wrapped); rows → `bg-active` + 2px `accent` bar keyed off `aria-selected`.
*Why not* a single universal on-state: v2 deliberately differentiates by control role, and
a one-size token (`data-[state=on]:bg-bg-pane`) is invisible on `bg-pane` bars — the bug we
are fixing. *Mode-cycle controls* (theme, density, list order, time-zone) get **no
persistent accent fill** — the icon/label conveys state; an `aria-pressed` fill on a
3-state cycle (theme) is misleading. (Order and time-zone are binary, so they *do* become
`Toggle`s with the accent-soft on-state; theme/density stay `Button` cycles.) *Flag if:*
moving to Base UI (`render` prop instead of Slot) — the `data-state` clobber that motivates
ARIA-keying disappears; re-audit.

**D2 — Accent collision: keep `accent` = brand, give primitives a neutral surface (Path A).**
*Criteria:* preserve v2's accent vocabulary; remove the per-call-site override smell
([B §5.4]); minimize churn. *Call:* repoint vendored primitives' `bg-accent` hover/selected
onto `bg-bg-hover` (controls) / `bg-bg-hl` (list items), matching v2's hover intent and the
hand-rolled controls. *Why not Path B* (`--color-brand` + revert `accent` to neutral):
churns every brand `accent` call site in app code for zero user-visible gain; the brand-blue
`bg-accent` spots (waterfall, jump pill, caret) are correct as-is. *Flag if:* shadcn ships a
distinct neutral `accent` default that we'd want to inherit — revisit.

**D3 — Type scale: add `--text-ui` 13px, keep existing token names, apply consistently.**
*Criteria:* the ticket forecloses "which size" — recover v2's scale [V §1] and apply it.
*Call:* the four existing tokens already match; the only missing rung is the 13px base, so
add `--text-ui`; register it with tailwind-merge ([A §4.2], correctness). *Why not* rename
the tokens to v2's bare names (`text-ui`/`text-mono`/`text-sm`/`text-xs`): they'd collide
with Tailwind's own `text-sm`/`text-xs` defaults — the `ui-` prefix exists precisely to
avoid that; keep it. *Density:* verified non-regressing — the dense table/rows use the
11.5/10.5 mono rungs, not 13px [V §8].

**D4 — Cursor: no `cursor-pointer` (Tailwind v4 / shadcn default).** *Criteria:* Clayton
decided; follow the platform/ecosystem default. *Call:* remove `cursor-pointer` from the
`Toggle` base and all hand-rolled sites; do not add the v3-restore snippet. *Source:*
Tailwind v4 upgrade guide — *"Buttons now use `cursor: default` … to match the default
browser behavior."* *Why:* a keyboard-driven app gains nothing from pointer cursors, and
the current mix (some controls pointer, some not) is itself the defect.

**D5 — Selection-bar width and the toggle "on" intensity are the only open appearance
choices → A/B (§6).** *Criteria:* the v2 extract is style-only and was authored against a
less-dense prototype; these two calls depend on protospy's real data density, so they're
rendered for ratification rather than decided unilaterally. All other visual calls were
recoverable from [V §6/§8] and are decided above.

**D6 — Gaps: add only `--text-ui`, `Input`/`SearchInput`, `StatusDot`, `PaneHeader`,
`JumpToLatestPill`; consolidate `CopyButton`.** *Criteria:* fill only real, on-screen
needs — each backed by a current duplication or a missing primitive for an existing raw
element ([B §5], [PRO-285 F2/F8]). *Why not* more: no component is invented beyond what the
UI already renders, per ticket scope.

**D7 — `EmptyState`, `SimpleTooltip` as single sources.** *Criteria:* one mechanism per
job ([B §5.6, §5.8]). *Call:* migrate `EventsView`/`CommandEmpty` to `EmptyState`; migrate
TopBar raw tooltips and native `title` controls to `SimpleTooltip`. *Why:* the parallel
implementations drift; consolidation is pure debt reduction, no visual change intended.

---

## Acceptance check (this authoring pass)

- [x] `docs/ui/design-system.md` exists with all required sections.
- [x] Every open design decision is decided-with-rationale (§7) **or** queued as a visual
      A/B (§6) — none left abstract.
- [x] The four folded decisions are each settled, encoding v2 intent via [A]'s method:
      **on-state** (§2.3 / D1), **accent** (§2.2 / D2), **font tokens** (§2.4 / D3),
      **cursor** (§2.5 / D4).
- [x] Per-surface change inventory is enumerated as a hand-off-ready list with chunk
      grouping and file-overlap sequencing (§5).
- [x] Decision log present (§7).
- [x] Structure/content/layout left at `main` — not reconciled against the handoff (§1).
