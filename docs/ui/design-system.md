# protospy UI Design System (`docs/ui/design-system.md`)

**Status:** living reference — the target design system for protospy's UI under
[PRO-316](https://linear.app/protospy/issue/PRO-316) (the effort to make the app's use of
shadcn/Tailwind/etc. idiomatic and aligned with `frontend-conventions.md` and the framework
skills). This document describes the **ideal end state**, not a migration log; the
per-surface change inventory and chunk sequencing live in a separate working document
(see §5).

**Audience:** the agents and reviewers writing and migrating UI code, and the PM sequencing
the work. This document says *what the UI should be*; the decision log (§7) records *why* so
a downstream agent that hits a bad fit flags it rather than conforming blindly. The migration
inventory (linked from §5) is the hand-off list the PM turns into tickets.

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
- **§5 — Execution & migration.** Pointer to the separate change-inventory working doc
  (the enumerated hand-off list, execution chunks, and `main`→target deltas).
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
| `accent` (`--color-accent`) | `#2563eb` / `#60a5fa` | **Structural accent** — focus ring (rendered as `focus-visible:ring-ring`, where `--color-ring` aliases `--color-border-focus` = `accent`; it is a *ring*, not a literal `border`), primary-button fill, tab underline, timing-waterfall fill, jump-to-latest pill, streaming caret, resize-handle hover, trace badge-dot. |
| `accent-soft` (`--color-accent-soft`) | `#dbeafe` / `rgba(96,165,250,.16)` | **The active-state *surface*** — the "on" background of a binary toggle / chip (2.3). |
| `accent-ink` (`--color-accent-ink`) | `#1d4ed8` / `#93c5fd` | **Emphasis/active *text* and a semantic *key* colour** — active toggle/chip text, query-param keys (context-bar path), header-name column, chip text, **stream `message_delta` event-type label**, **trace-pill external-link hover** [V §7]. |

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
| **Segmented control** — choose one of a small visible set (rows/table switch, transcript/events, **time-zone Local/UTC**) | **raised `bg-pane` fill on a `bg-sub` track** + a **theme-aware** elevation shadow (light `0 1px 1px rgba(0,0,0,.05)`, with a `dark:` override — see 2.3 note); **no accent** | `toggleVariants` (`variant: segmented`) + `ToggleGroup type="single"` track = `bg-sub` | `aria-pressed` |
| **Tabs** (Inspector) | `text-ink` + 2px `accent` **bottom-border underline** + weight 500 (not a fill) | `TabsList variant="line"` / `TabsTrigger` | `data-[state=active]` — safe **only** because `TabsTrigger` is not `asChild`/tooltip-wrapped; verify at the call site, and if it ever is wrapped, re-key off `aria-selected` ([A §1.4a]) |
| **Selected row** (exchange list, stream event) | `bg-active`; URI → `ink` + weight 500; **2px `accent` left bar**; in-trace adds the 4px trace-colour bar | row component (`role=option`) | `aria-selected` |

**The current bug this fixes.** `toggleVariants` today is
`data-[state=on]:bg-bg-pane data-[state=on]:text-ink` — both the wrong *key*
(`data-[state=on]` is clobbered on tooltip-wrapped toggles) and the wrong *value*
(`bg-bg-pane` is invisible on a `bg-pane` toolbar — [A]'s named absolute-on-state
anti-pattern, [B §5.3]).

**Concrete primitive target (`toggle.tsx`):**

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

`ToggleGroup` used as a segmented control passes `variant="segmented"` to its items and
sets its own track to `bg-bg-sub` (the recess the raised fill rises from). Standalone
`Toggle` (toolbar icon toggles) uses `variant="default"` (accent-soft). Note `cursor-pointer`
is **removed** from the base — see 2.5 — and the base radius is `rounded` (4px), **not** the
current `rounded-md` (6px), per the control-radius normalization in 2.6.

> **Dark-mode elevation note.** The segmented "on" cue is primarily the `bg-pane`-on-`bg-sub`
> step; the drop shadow is a secondary reinforcement. The v2 value `0 1px 1px rgba(0,0,0,.05)`
> is authored for **light** — on a dark raised pane a 5%-black shadow is effectively invisible
> and points the wrong way. The CVA above therefore carries a `dark:` override so the cue reads
> in both themes; if a second surface ever needs the same shadow, promote it to a
> `--shadow-segment` token (defined per theme) rather than repeating the literals. Never ship a
> single hardcoded light shadow into both themes.

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
- **Register the custom font tokens with tailwind-merge via the `theme` keys** ([A §4.2] —
  custom font-size tokens do **not** auto-merge; this is a correctness bug, not a nicety).
  The idiomatic form mirrors Tailwind v4's `@theme` namespaces 1:1: register font sizes under
  `theme.text` and font families under `theme.font` —
  `extend: { theme: { text: ["ui", "ui-xs", "ui-sm", "ui-mono", "ctx-path"], font: ["ui", "mono"] } }`.
  Prefer this over the lower-level `classGroups` form, which is the escape hatch for *non-theme*
  bespoke utilities and forces repeating the `text-`/`font-` prefix per entry.
- **Use idiomatic font-family tokens.** Name them `--font-ui` (Inter) and `--font-mono`
  (JetBrains Mono) so the v4 `--font-*` namespace generates the conventional `font-ui` /
  `font-mono` utilities. Non-idiomatic names like `--font-family-ui` generate the awkward
  `font-family-ui` utility and read as a custom utility rather than a theme value — reinforcing
  idiomatic token naming is itself in scope for the PRO-316 cleanup.
- **Per-element exceptions that stay arbitrary** (genuine per-element values in [V §1],
  no token): brand wordmark `text-[14.5px]`; command-palette **input** is genuinely **14px**
  → use Tailwind `text-sm` (14px exactly — the one place `text-sm` is correct); `kbd`
  10.5px → `text-ui-xs`.
- **Density:** the dense list/table does **not** regress — per [V §8] table cells are mono
  `text-ui-sm` (11.5) and headers `text-ui-xs` (10.5); only *chrome/body* moves to 13px.

A per-surface mapping table is in the migration inventory (§5). Where a surface's current
size is ambiguous, that inventory states the target token.

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
  icon controls to `rounded` (Tailwind `rounded` = 4px). This includes the **`Toggle`
  primitive base** (`toggle.tsx`), currently `rounded-md` (6px) — see the corrected code
  block in 2.3; ContextBar already overrides to 4px. Method badge stays `3px`; pills stay
  `999px` (`rounded-full`); command palette stays `10px` — all match v2.
- **Segmented-control button radius → `rounded` (4px).** v2's literal value is **3px**
  [V §3, §8], which on `main` is realized as the arbitrary `rounded-[3px]`. We normalize it
  up to `radius-sm` (4px) so segmented items share the one control radius and drop the
  arbitrary value — an idiom simplification, not a pixel-faithful port. *Alternative (not an
  open decision):* restore the v2 `3px` via `rounded-[3px]` if the 1px difference ever reads
  wrong at the segmented control's small size; recorded so the choice can be reversed
  without re-deriving it.
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

> **`Switch` and `Checkbox` are intentionally absent** from this matrix and the target set —
> see §7-D8. The conventions matrix ([A §2.2–2.3]) carries them as first-class, so their
> omission is a recorded decision, not an oversight; an agent adding a settings/preferences
> surface should re-open the choice.

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
| Idiomatic font-family tokens `--font-ui` / `--font-mono` | v4 `--font-*` namespace → conventional `font-ui` / `font-mono` utilities (2.4). | Replaces the non-idiomatic `--font-family-*` naming; idiom alignment for PRO-316. |
| (tailwind-merge) register font tokens via `theme.text` + `theme.font` | Custom font-size/family tokens don't auto-merge ([A §4.2]); a correctness bug. | Needed the moment `--text-ui` / `font-*` are consumed via `cn()`. |

No new *colour* tokens are needed — the elevation scale and accent family already exist;
the work is to *reserve* and *apply* them (§2), not extend them.

**Primitives / shared components** (each backed by a current duplication):

| Add | Replaces | Sites today | Real need |
| --- | --- | --- | --- |
| `Input` (shadcn) + `SearchInput` composite (icon + input + clear) | byte-for-byte duplicated raw search-box shell | `FilterBar`, `HeadersPane` ([B §5.2], [PRO-285 F2/F8]) | 2 verbatim copies; raw `<input>` has no primitive. |
| `StatusDot` (state enum → dot; `size` + `halo` variants) | duplicated `w-[7px] h-[7px] rounded-full bg-* [animate-pulse]` | `TopBar`, `StatusBar`, `LiveIndicator` ([B §5.10], [PRO-285 F8]) | 3 copies of the same atom. |
| `PaneHeader` (head bar wrapper) | duplicated `flex items-center h-[30px] bg-* border-b` | `BodyPane`, `StreamView`, `ChatStreamView`, `HeadersSplit`, `ExchangeList` ([PRO-285 F8]) | 5 copies; also the surface to apply the `bg-pane` elevation correction (2.1) once. |
| `JumpToLatestPill` | duplicated jump pill | `StreamView`, `ChatStreamView` ([B §5.10]) | verbatim duplicate. |
| `CopyButton` (consolidate onto `Button`) | 3 independent copy impls | `CopyButton` (text), `HeadersPane` per-row (icon), + adopt `Button variant="link"`/`ghost` | one affordance + success signal, not three ([B §5.5]). |

**`StatusDot` variants (v2 values, [V §8]).** The atom backs two visually distinct dots, so
it takes `size` and `halo` variants rather than hard-coding one:

| Use | Size | Halo | States |
| --- | --- | --- | --- |
| **Connection dot** (`TopBar`, `StatusBar`) | `7px` | `3px` ring — `box-shadow: 0 0 0 3px <status>-bg` | open → `green`; connecting → `amber` + pulse; down → `red`. |
| **Live-indicator dot** (`LiveIndicator`) | `6px` | none | live → `green` + pulse; paused → `amber`, no animation. |

The `3px` halo is a `ring-3`/`box-shadow` on the status `-bg` token; the pulse is the existing
`animate-pulse`. Keep both sizes — collapsing the live-indicator dot to 7px or dropping the
connection-dot halo would diverge from v2.

`eventTypeBadgeClass` is **not** a new primitive but must be **tokenized** and carry the full
v2 event-type colour map ([V §8], [B §5.11], [PRO-285 F3]; absorbs PRO-272) — not just the two
arms (`purple`/`green`) that exist as raw palette today:

| Event type | Token (text + `-bg`) |
| --- | --- |
| `message_start` | `purple` / `purple-bg` |
| `content_block_delta` | `green` / `green-bg` |
| `message_delta` | `accent-ink` (key colour, no fill) |
| `message_stop` | `mid` |
| `ping` | `dim` |

Replace the raw `text-purple-500 bg-purple-500/10` / `bg-green-500/10` with the semantic
`purple`/`green` (+`-bg`) tokens that theme for dark mode, and confirm the other three arms
render on `accent-ink`/`mid`/`dim` per the table (they carry no raw-palette smell today but are
part of the same map and must be verified, not assumed).

---

## §5. Execution & migration (separate document)

The per-surface change inventory, execution-chunk grouping, and file-overlap sequencing are
maintained as a **separate working document**, not in this spec:

> **[protospy UI Design-System Change Inventory (PRO-316)](#)** — Obsidian:
> `UI/v2.1/design-system-change-inventory.md`

They live there because they describe the *path* from `main` to this target — and go stale as
the migration lands — whereas this spec describes the *destination* and does not. That doc
carries the `main`→target deltas this spec deliberately omits, including:

- the per-primitive (`P*`) and per-surface (`A*`) change rows, grouped into execution chunks;
- the dependency order and file-overlap sequencing;
- the **global mechanical migrations** the spec implies but doesn't enumerate — the twMerge
  `classGroups`→`theme` move (2.4), the `--font-family-*`→`--font-*` token rename (2.4), the
  `--color-accent-foreground` alias-removal sequencing (2.2), and the `cursor-pointer` /
  icon-sizing sweeps (2.5/2.6).

When this spec changes, update that inventory; when the inventory's rows all land, this spec
still stands as the reference for *what the UI is*.

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
are fixing. *Mode-cycle controls* (theme, density, **list order**) get **no persistent accent
fill** — the icon/label conveys state; an `aria-pressed` fill on a cycle is misleading.
*Order* stays its v2 arrow-icon form (README §228, list toolbar) → `Button variant="ghost"`
that flips newest↔oldest, icon + tooltip conveying direction; *not* a `Toggle` (whose
`aria-pressed` would announce only "pressed", naming neither option) and *not* a segmented
group (the arrow icon is the chosen toolbar treatment). *Time-zone* (Local/UTC) is a genuine
choose-one-of-two, so it becomes a **`ToggleGroup type="single"`** (segmented, both labels
always visible) — which also fixes the current control's APG violation (its label flips
Local↔UTC with state, and "the label must not change with state" [A §2.3]); the rejected
alternative — a bare `Toggle` — both announces only "pressed" and forces that state-dependent
label. *Flag if:* moving to Base UI (`render` prop instead of Slot) — the `data-state` clobber
that motivates ARIA-keying disappears; re-audit.

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
11.5/10.5 mono rungs, not 13px [V §8]. *Compact ramp out of scope:* v2 also defines a
**compact** density column ([V §1, §4]) that steps every size down ~0.5–1px (`text-ui`
13→12.5, etc.); this spec adds only the regular-density rung and does **not** introduce
compact font tokens or a compact ramp. The density switch is a behaviour/mechanism frozen
at `main` (§1), so the compact ramp is deliberately deferred, not forgotten — see the ticket
comment for where v2 specifies it should apply if we revisit.

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

**D8 — `Switch` and `Checkbox` intentionally excluded from the target primitive set.**
*Criteria:* the conventions matrix ([A §2.2–2.3]) carries `Switch` (`role=switch`/`aria-checked`,
"on/off") and `Checkbox` (`aria-checked`, indeterminate, form-submitted) as first-class, and
recommends "default to Switch for immediate-effect on/off settings" — so excluding them is a
call that must be recorded, not assumed. *Call:* protospy's binary controls are **toolbar-style
icon/label toggles** (trace-group, decode), where `Toggle`'s `aria-pressed` button semantics
fit; its choose-one-of-N controls (rows/table, transcript/events, time-zone) are **segmented
`ToggleGroup`s**. There is **no settings/preferences list surface** where a sliding `Switch`'s
on/off affordance and footprint would belong, and no multi-select form list or indeterminate
need that would call for `Checkbox` — so adding either would invent a primitive the UI doesn't
render (against §4's gap discipline). *Why not* route the toolbar toggles to `Switch`: they are
immediate-effect *buttons* in a dense bar, not labelled settings rows; `Toggle` is the matched
primitive ([A §2.2], "toolbar bold, mute" row). *Flag if:* a settings/preferences surface is
introduced — re-open the choice and default to `Switch` for its immediate on/off rows per
[A §2.3].

---

## Acceptance check

- [x] `docs/ui/design-system.md` stands as a living reference with all sections (§1–§7).
- [x] Every design decision is decided-with-rationale (§7) **or** queued as a visual A/B
      (§6) — none left abstract.
- [x] The folded decisions are each settled, encoding v2 intent via [A]'s method:
      **on-state** (§2.3 / D1), **accent** (§2.2 / D2), **font tokens** (§2.4 / D3),
      **cursor** (§2.5 / D4) — plus the `Switch`/`Checkbox` exclusion (D8).
- [x] The per-surface change inventory, execution chunks, and file-overlap sequencing live
      in the separate migration working doc (§5), keeping this spec a stable reference.
- [x] Decision log present (§7).
- [x] Structure/content/layout left at `main` — not reconciled against the handoff (§1).
