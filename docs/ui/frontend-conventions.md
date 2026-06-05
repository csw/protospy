# protospy Frontend Conventions (`docs/ui/frontend-conventions.md`)

**Audience:** AI coding agents and human reviewers writing/reviewing UI code for protospy (React 19 + TypeScript + Vite; shadcn/ui over Radix; Tailwind CSS v4 with CSS-variable semantic tokens, class-based dark mode). This is the authoritative convention basis. Version applicability is noted throughout. **Out of scope (consult existing skills):** general React perf/memoization; shadcn install commands/recipes; Tailwind v4 CSS-architecture setup, dark-mode provider, and absolute→token color-migration table.

**Packaging note (current as of June 2026):** shadcn/ui's `new-york` style now imports from the **unified `radix-ui` package** (e.g. `import { Tooltip as TooltipPrimitive } from "radix-ui"`) rather than individual `@radix-ui/react-*` packages. This was introduced in the shadcn June 2025 "radix-ui Migration" changelog and made the `new-york` default in the **shadcn/ui "February 2026 — Unified Radix UI Package" changelog** (ui.shadcn.com/docs/changelog/2026-02-radix-ui): *"The new-york style now uses the unified radix-ui package instead of individual @radix-ui/react-* packages,"* shown as `- import * as DialogPrimitive from "@radix-ui/react-dialog"` → `+ import { Dialog as DialogPrimitive } from "radix-ui"`, which *"results in a cleaner package.json with a single radix-ui dependency."* Migrate with `npx shadcn@latest migrate radix`. The unified package is tree-shakeable; both import styles behave identically at runtime; `@radix-ui/react-slot` is still the Slot source. (shadcn also now optionally supports Base UI via `style: base-*`, which replaces `asChild` with a `render` prop — protospy stays on Radix.)

---

## TL;DR

- **Pick primitives by interaction semantics (the ARIA role/state implied), never by appearance; control state with `value`/`onValueChange`-style pairs; and never style an `asChild`-wrapped inner primitive off `data-state` — the outer primitive's `data-state` wins on the merged node, so key off `aria-pressed`/`aria-checked` instead.** This is the single highest-leverage rule in this doc.
- **Express interactive states (hover/pressed/active) as relative surface elevations on a semantic scale (Radix-Colors / Primer style), not absolute palette colors** (`bg-pane`→`bg-sub` step, not `bg-blue-600 hover:bg-blue-700`), so affordances read consistently on any surface.
- **Configure `cn()`/tailwind-merge for protospy's bespoke tokens** — `extendTailwindMerge` is required for custom `text-ui-*` font-size and custom surface utilities (custom *colors* work without config), and use CVA for variant APIs that encode those elevation/state tokens.

---

## Area 1 — Radix primitive usage depth

### 1.1 Accessibility: what Radix gives you vs. what you must supply

Per the Radix Accessibility overview (radix-ui.com/primitives/docs/overview/accessibility), verbatim: *"Radix Primitives follow the WAI-ARIA authoring practices guidelines and are tested in a wide selection of modern browsers and commonly used assistive technologies. We take care of many of the difficult implementation details related to accessibility, including aria and role attributes, focus management, and keyboard navigation."* Concretely, Radix automatically supplies: `role`/`aria-*` attributes; focus management (focus trapping + restoration for overlays, roving tabindex for composite widgets); and keyboard navigation. Examples: `Dialog.Content` gets `role="dialog"` + `aria-modal="true"`; `Switch.Root` gets `role="switch"`; `Accordion.Trigger` gets `aria-expanded`/`aria-controls`; `Tabs.Trigger`↔`Tabs.Content` are wired with `aria-selected`/`aria-controls`/`aria-labelledby`. Radix's overview also notes, verbatim, that *"in AlertDialog, when the modal is opened, focus is programmatically moved to a Cancel button element to anticipate a response to the prompt."*

**You must still supply:**
- **Accessible names.** Icon-only triggers need `aria-label` (e.g. `<Tooltip.Trigger aria-label="Settings">`). Radix provides the `Label` primitive to associate visible labels with controls; you must use it.
- **Dialog `Title`/`Description`** content (Radix wires `aria-labelledby`/`aria-describedby` but the text is yours).
- **Continued accessibility when you change element types via `asChild`** — "it is your responsibility to ensure it remains accessible and functional" (Radix Composition docs). A `Tooltip.Trigger` switched to a `div` stops being focusable and breaks.
- **Color contrast** and **tooltip caveats** (a tooltip must not contain interactive content — see §2.4).

Rule: rely on Radix for roles/focus/keyboard; treat names, descriptions, contrast, and element-type correctness as your job.

### 1.2 Controlled vs uncontrolled

Every stateful Radix primitive is **uncontrolled by default** and can be controlled. The prop pairs differ per primitive but follow one shape — a `defaultX` (uncontrolled) OR `x` + `onXChange` (controlled):

| Primitive | Uncontrolled | Controlled | Change handler |
|---|---|---|---|
| Dialog/Popover/Tooltip/Collapsible/HoverCard | `defaultOpen` | `open` | `onOpenChange` |
| Select/Tabs/ToggleGroup(single)/RadioGroup/Accordion | `defaultValue` | `value` | `onValueChange` |
| Toggle | `defaultPressed` | `pressed` | `onPressedChange` |
| Checkbox/Switch | `defaultChecked` | `checked` | `onCheckedChange` |

**General rule:** prefer **uncontrolled** unless you need to (a) read/derive the value in React, (b) drive it from external state, or (c) constrain it. Uncontrolled is the better default for forms (Radix renders a hidden native input so `FormData` "just works").

**Common mistakes:**
- **Controlled with no handler → frozen UI.** `<Switch checked={x} />` with no `onCheckedChange` locks the control. If you pass `checked`/`value`/`open`/`pressed`, you MUST pass the matching `onChange`.
- **Mixing both** `value` and `defaultValue` (or `checked`+`defaultChecked`) — pass exactly one.
- **ToggleGroup single-select de-selection:** `onValueChange` fires with `""` when the user deselects; guard if a value must always be set: `onValueChange={(v) => { if (v) setValue(v); }}` (Radix ToggleGroup docs).
- **Checkbox/Select tri-state:** Checkbox supports `"indeterminate"`; `value={undefined}` is explicitly allowed to represent indeterminate (Radix release notes #2947).

### 1.3 The `asChild` / Slot composition model

`asChild` replaces a primitive's default DOM node with **its single child**, cloning it and merging Radix's props/behavior in (`@radix-ui/react-slot`). Mechanics every agent must know:

- **Single child required.** The child must be exactly one React element that renders a DOM node. Fragments, strings, multiple children, or `null` break it. For multiple children, wrap the "real" one in `<Slottable>` (from `radix-ui`'s Slot) so Slot knows which child to clone.
- **Child must spread props.** A custom component used under `asChild` must do `const C = (props) => <button {...props} />`; if it drops props, Radix's behavior (and `data-*`/`aria-*`) never lands on the DOM, and e.g. the tooltip silently won't show (Radix discussion #1166).
- **Child must forward ref.** Radix often attaches a `ref` (to measure/position). Under React 19 you can accept `ref` as a normal prop; pre-19 use `React.forwardRef`. Missing ref forwarding breaks positioning/measurement.
- **className merges** through Slot (both are kept/merged).
- **Event handlers compose; child handler runs first.** Per the Radix Slot docs: *"When merging event handlers, Slot will create a new function where the child handler takes precedence over the slot handler."* Both run — there is no way to make `stopPropagation` suppress the parent's merged handler. To conditionally skip the parent's logic, the parent must check `event.defaultPrevented` and the child must call `preventDefault()`:
  ```tsx
  <Button asChild onClick={(e) => { if (!e.defaultPrevented) track(); }}>
    <a href="/x" onClick={(e) => e.preventDefault()}>X</a>
  </Button>
  ```
  (Slot merge order is not configurable — Radix issue #1216.)
- **Deep composition is supported.** You can nest `asChild` triggers (e.g. `Tooltip.Trigger asChild > Dialog.Trigger asChild > MyButton`) — Radix's own Composition docs show exactly this pattern. **Order matters:** the outermost wrapper goes outside; the single real DOM element goes innermost. Wrapping a non-DOM component (e.g. `DialogTrigger asChild > Tooltip`) silently fails because the trigger's props land on a component that doesn't forward them to a DOM node.

### 1.4 `data-state` styling and its gotchas (general topic)

Stateful Radix parts expose state via a `data-state` attribute you can target with Tailwind's `data-[state=…]:` variant (Radix Styling docs). **`data-state` values differ by primitive** — enumerate before styling:

| Primitive | `data-state` values |
|---|---|
| Dialog/Popover/Tooltip/Dropdown/Collapsible | `open` / `closed` |
| Tooltip (open) | also `delayed-open` (and `instant-open`) |
| Toggle / ToggleGroup item | `on` / `off` |
| Checkbox | `checked` / `unchecked` / `indeterminate` |
| Switch | `checked` / `unchecked` |
| Accordion item / trigger | `open` / `closed` |
| Tabs trigger | `active` / `inactive` |
| RadioGroup item | `checked` / `unchecked` |

**`data-state` vs `data-[disabled]` vs `aria-*`:** Radix exposes disabled as `data-disabled` (presence attribute, target with `data-[disabled]:`), not via `data-state`. The reliability ordering for styling:
- `aria-pressed` / `aria-checked` / `aria-expanded` / `aria-selected` reflect the *semantic* state and are the most robust to compose against (they are set per-element by the owning primitive and don't collide on merge — see headline gotcha).
- `data-state` is convenient but **primitive-scoped and collision-prone** under `asChild`.
- `data-disabled` is reliable for disabled styling; note Radix uses `data-disabled` (attribute presence) while ARIA uses `aria-disabled="true"`.

#### (a) HEADLINE GOTCHA: `asChild` prop-merge order overwrites inner `data-state`

When a Radix trigger wraps another stateful primitive with `asChild` (e.g. `Tooltip.Trigger asChild` around a `Toggle`), **both primitives want to write `data-state` onto the same merged DOM node, and the OUTER primitive's props are spread last, so its `data-state` wins.** A `Toggle`'s `data-[state=on]:` styling silently fails because the merged node carries the Tooltip's `data-state="closed"`/`"delayed-open"` instead of the Toggle's `on`/`off`.

This is confirmed in **radix-ui/primitives Discussion #560** ("the `data-state` attribute is overwritten by the Tooltip's data-state") and a Radix maintainer's linked reproduction: for a tooltip-wrapped toggle inside a popover, "the data-state shows `closed`… but `delayed-open` for the standalone… because the Popover data-attrs win." Multiple users report the same with Toolbar ToggleItems. The root cause is the Slot's single-attribute merge: state for different elements is all funneled into one `data-state` attribute, and last-writer (the outer/wrapping primitive) wins.

**Working fixes (in preference order):**
1. **Key the inner styling off `aria-pressed` (Toggle) / `aria-checked` (Checkbox/Switch) instead of `data-state`.** ARIA attributes are written by the owning primitive and don't get clobbered the same way:
   ```tsx
   <Tooltip>
     <Tooltip.Trigger asChild>
       <Toggle pressed={p} onPressedChange={setP}
         className="aria-pressed:bg-accent-soft aria-pressed:text-accent" />
     </Tooltip.Trigger>
     <Tooltip.Content>Bold</Tooltip.Content>
   </Tooltip>
   ```
   (Several maintainers and commenters in #560 endorse styling off a class/ARIA you control rather than the clashing `data-state`.)
2. **Restructure the composition** so the two state-owners aren't on the same node — e.g. add a wrapping element (`<span>`) between the triggers so each primitive gets its own node (the "add a span around the trigger" fix reported in #560), or render the Toggle *inside* a non-`asChild` trigger.
3. **A `DataStatePropInterceptor`** (a forwardRef component that captures the incoming `data-state` and re-emits it on its own wrapper span) — documented in #560, but heavier; prefer (1).

Flag for reviewers: any `data-[state=…]:` class on a primitive that is also an `asChild` child of another stateful primitive is a likely silent bug.

#### (b) Other composition gotchas

- **Forwarded-prop collisions beyond `data-state`:** the same last-writer merge affects any prop both layers set. `className` is *merged* (safe); event handlers are *composed* (both run, child first); but plain value props (including `data-state`, `role` in edge cases) are *overwritten*. Be deliberate about which layer owns which prop.
- **Single-child / ref / spread requirements** — see §1.3; these are the most common "nothing happens, no error" failures.
- **Reading internal state in JSX** (e.g. to render different labels for checked/unchecked) has no first-class API; Radix issue #2904 shows the community workaround is a render-prop child via `asChild`. Prefer lifting to controlled state instead.

---

## Area 2 — Primitive selection ("right primitive for the job")

### 2.1 The general principle

**Choose a primitive by the interaction semantics and the ARIA role/state it implies, not by how it looks.** A pill that looks like a switch but submits with a form may need to be a Checkbox; a link styled as a button must still be an `<a>`. Apply this test to *any* ambiguous control: *What is the user doing (acting? navigating? selecting one? selecting many? toggling persistent state? expanding?), and what role/state should a screen reader announce?* Then pick the primitive whose built-in role matches.

### 2.2 Decision matrix (semantics → primitive → ARIA)

| Interaction semantics | Primitive | Implied role / state |
|---|---|---|
| Stateless action (do something now) | `Button` / `<button>` | `role=button`, no pressed state |
| Navigate to a URL/route/anchor | `<a href>` (Button `asChild`) | `role=link` |
| Binary persistent on/off, immediate effect (toolbar bold, mute) | `Toggle` | `role=button` + `aria-pressed` (`data-state` on/off) |
| Binary on/off setting, "on/off" semantics, immediate | `Switch` | `role=switch` + `aria-checked` |
| Binary checked/unchecked, often form-submitted; supports indeterminate | `Checkbox` | `role=checkbox` + `aria-checked` (+ `mixed`) |
| Choose exactly one from a small visible set | `RadioGroup` or `ToggleGroup type="single"` | radios: `aria-checked`; toggle group items: `aria-pressed` |
| Choose many from a visible set | multiple `Checkbox`, or `ToggleGroup type="multiple"` | `aria-checked` / `aria-pressed` per item |
| Disclosure: show/hide one region | `Collapsible` (or `Accordion`) | trigger `aria-expanded` + `aria-controls` |
| Multiple disclosure sections, one/many open | `Accordion` | per-item `aria-expanded`; `data-state` open/closed |
| Switch between mutually exclusive panels | `Tabs` | tab `role=tab` + `aria-selected`; panel `role=tabpanel` |
| Pick a value from a list (form control) | `Select` (or Combobox if filtering) | `role=listbox`/`combobox`, options `aria-selected` |
| Trigger a list of **actions/commands** | `DropdownMenu` | `role=menu` / `menuitem` |
| Modal interruption requiring a decision | `Dialog` / `AlertDialog` | `role=dialog` / `alertdialog`, `aria-modal` |
| Transient supplementary info on hover/focus (non-interactive) | `Tooltip` | `role=tooltip` (must contain no interactive content) |
| Rich hover preview (may contain links) | `HoverCard` | non-modal, pointer-driven |

### 2.3 Worked example: Toggle vs ToggleGroup vs Switch vs Button vs Checkbox vs Radio

The on-state semantics each implies:
- **Toggle / Button-as-toggle** → `aria-pressed`. Screen reader: "…toggle button, pressed."
- **Checkbox / Radio** → `aria-checked`. "…checkbox, checked."
- **Switch** → `role="switch"` + `aria-checked`. NVDA/JAWS announce **"on/off"** rather than "checked/not checked."

**Switch vs Checkbox for a setting is genuinely contested.** WAI-ARIA APG (Switch Pattern) states switch, checkbox, and toggle button "are often functionally interchangeable" and you should "choose the role that best matches both the visual design and semantics." The common heuristic (per APG's "Lights on/off" example, Scott O'Hara's aria-switch notes, and others): **use a Switch when the change takes immediate effect and reads naturally as on/off** (dark mode, notifications); **use a Checkbox when the choice is form-submitted later** (accept terms) or **belongs in a group of selectable items**, or when you need an indeterminate state (switch has no `mixed`). But support is messy: Adrian Roselli's "Switch Role Support" documents inconsistent screen-reader announcements, and W3C aria-practices issue #1327 ("Clear up the mess around the switch role mapping") shows the spec itself is unsettled (Firefox vs Chrome differ on `aria-pressed` vs `aria-checked`). **Recommendation for protospy:** default to **Switch for immediate-effect on/off settings**; fall back to Checkbox where a third/indeterminate state or form semantics are needed; never change the label text on toggle (APG: the label must not change with state).

Accessibility cost of choosing wrong: a Toggle (`aria-pressed`) used where users expect on/off announces "pressed" not "on"; a Checkbox used for an immediate theme switch can violate WCAG 3.2.1 (On Focus / unexpected change) expectations.

### 2.4 Other contested / ambiguous selection cases

- **Button vs Link (action vs navigation).** The settled rule (a11y-collective, MDN, GOV.UK): **if it changes the URL/route, use `<a>`; otherwise `<button>`.** Acid test: if it still works with JS disabled (navigates), it's a link. Buttons activate on Space *and* Enter; links on Enter only. A thing that *looks* like a button but navigates must still be an anchor (`<Button asChild><a/></Button>`); `role="button"` on an `<a>` is an anti-pattern that doesn't replicate native behavior.
- **Dialog vs AlertDialog.** Use `AlertDialog` (`role=alertdialog`) only for a brief, important interruption that needs a decision (destructive confirm, "discard changes?") — APG reserves alertdialog for messages that "divert users' attention." Use `Dialog` for everything else. The extra friction (alertdialog moves focus to Cancel, expects an explicit choice) is warranted only when an accidental dismissal is costly.
- **Popover vs Tooltip vs HoverCard.** All three "pop" content, but: **Tooltip** is keyboard/focus + hover, *non-interactive content only* — "in the accessibility world, tooltips must not contain interactive content. If they contain interactive content, you're not looking at a tooltip, but a dialog" (Heydon Pickering, via CSS-Tricks "Clarifying the Relationship Between Popovers and Dialogs"). **HoverCard** is pointer-hover-driven and *may* contain rich/interactive content but is not keyboard-accessible the way a Popover is — don't put must-reach controls in it. **Popover** is click-triggered, focusable, can hold interactive content. Rule: interactive content → Popover (or Dialog); pure description → Tooltip; supplementary hover preview → HoverCard.
- **DropdownMenu vs Select vs Combobox vs listbox.** **`role=menu`/`menuitem` (DropdownMenu) is for *actions/commands*** (an app menu), not value selection; **`role=listbox` (Select) is a form control with a *selected value***. Adrian Roselli ("Be Careful Using 'Menu'") and the Headless UI maintainers both stress: a menu is "like the menu bar in your operating system," a listbox is "for making custom `<select>` controls." Add a **Combobox** (text input + `role=combobox` controlling a listbox popup) only when users need to **type to filter**; APG notes combobox lets users explore choices and press Escape to revert, unlike a single-select listbox which changes value on navigation.
- **ToggleGroup single vs multiple.** `type="single"` = mutually exclusive (radio-like, `aria-pressed`/value); `type="multiple"` = independent toggles. Use single for "one alignment," multiple for "any of bold/italic/underline."
- **Accordion vs Collapsible vs Tabs.** **Collapsible** = one show/hide region. **Accordion** = a set of collapsible sections (one or many open). **Tabs** = mutually exclusive panels where exactly one is always visible. If content is peer panels and one must always show → Tabs; if sections independently expand/collapse → Accordion/Collapsible.

When in doubt, link the reviewer to the relevant **WAI-ARIA APG pattern** (w3.org/WAI/ARIA/apg) — it is the authoritative arbiter.

---

## Area 3 — Relative / elevation token model

### 3.1 The principle: interaction states as relative elevation, not absolute color

Express hover/pressed/active as **steps along a surface-elevation scale** rather than hardcoded palette colors. A button's hover should mean "one elevation step up from whatever surface I'm on," so the same component reads correctly on `bg-pane` and on `bg-sub`.

**Anti-pattern (absolute):**
```html
<button class="bg-blue-600 hover:bg-blue-700 active:bg-blue-800">
```
This bakes in a specific hue/lightness; nested on a darker surface it can invert contrast or look detached, and every component re-hardcodes the steps.

**Pattern (relative/semantic):**
```html
<button class="bg-pane hover:bg-sub active:bg-sub/80 border-accent text-accent">
```
The hover/active affordance is defined as movement on protospy's surface scale (`pane` → `sub`), so it composes regardless of the parent surface.

### 3.2 Why relative composes better across nested surfaces

Mature systems converge on this. **Radix Colors'** 12-step scale assigns *fixed UI roles per step* (Radix Colors "Understanding the scale"). Verbatim from that page: *"Steps 3, 4, and 5 are designed for UI component backgrounds. Step 3 is for normal states. Step 4 is for hover states. Step 5 is for pressed or selected states."* For borders, verbatim: *"Steps 6, 7, and 8 are designed for borders. Step 6 is designed for subtle borders on components which are not interactive… Step 7 is designed for subtle borders on interactive components"* (step 8: stronger borders / focus rings). For solid fills, verbatim: *"Step 9 has the highest chroma of all steps in the scale. In other words, it's the purest step… Step 10 is designed for component hover states, where step 9 is the component's normal state background."* Steps **11 / 12** are low- and high-contrast text. Because the role of each step is constant, "hover = step 4, pressed = step 5" works for *any* hue, and Radix's alpha variants are designed to appear visually the same over any background — which is exactly what lets a layered state read consistently over nested surfaces.

**GitHub Primer** encodes the same idea as *semantic state tokens* rather than palette values. Primer's three-tier architecture is explicit (Primer "Color usage"): base tokens *"should never be used directly in code or design"*; functional and component tokens reference them and respect color modes. Interaction states live in a **scale slot** appended to a generic `control` pattern — verbatim from Primer's DESIGN_TOKENS_GUIDE.md, the canonical control trio is `--control-bgColor-rest`, `--control-bgColor-hover`, `--control-bgColor-active` (with `--bgColor-disabled` for the disabled state), and surfaces are named by elevation: `--bgColor-default`, `--bgColor-muted`, `--bgColor-inset` (legacy `canvas.default/subtle/inset/overlay`). Primer states the neutral scale's "first six steps are typically used for background colors" and *"for control components with state, the scale accommodates rest, hover, and active"* — i.e. states are positions on a shared elevation scale, and the generic `control` pattern intentionally drives buttons, inputs, and ActionList items from one token set. Primer's core rule: "Never use raw values… Only use semantic tokens." Note the relative-elevation pattern in practice: Primer's invisible-button states go rest `transparent` → hover ≈ 10% neutral overlay (`#818b981a`) → active ≈ 15% (`#818b9826`); its default button goes rest `#f6f8fa` → hover `#eff2f5` → active `#e6eaef` — each a single step "up" the neutral scale, not a jump to a new hue. **Tailwind's** own palette philosophy (numbered 50–950 scales) and **shadcn's** CSS-variable convention (`--background`/`--foreground`, `--muted`, `--accent`) are the same move at different granularities.

protospy already follows this with `bg-pane`/`bg-sub` (elevation surfaces) and `--color-accent` consumed via `text-accent`/`bg-accent-soft`/`border-accent`. Treat `pane`/`sub` as an elevation scale and define interaction states as transitions on it.

### 3.3 Extending the Tailwind v4 token set systematically

Tailwind v4 is CSS-first: define tokens with **`@theme`**, and each namespaced variable both generates utilities and is available as a CSS variable (Tailwind "Theme variables"). Namespaces that matter here: `--color-*` → `bg-*`/`text-*`/`border-*`; `--text-*` → font-size utilities (protospy's `text-ui-*`).

**Naming an elevation scale** — prefer ordinal or role names so the relative model is legible:
```css
@theme {
  /* surface elevation scale (low → high) */
  --color-surface-0: …;   /* app background        */
  --color-surface-1: …;   /* = bg-pane (cards/panes) */
  --color-surface-2: …;   /* = bg-sub (raised/hover) */
  --color-surface-3: …;   /* pressed/active         */
  /* accent semantic tokens */
  --color-accent: …;        /* text-accent / border-accent */
  --color-accent-soft: …;   /* bg-accent-soft (tinted surface) */
  /* bespoke font sizes */
  --text-ui-sm: …;          /* text-ui-sm */
  --text-ui-base: …;
}
```
This generates `bg-surface-1`, `bg-accent-soft`, `text-ui-sm`, etc. **Map interaction states onto the scale** (ideally centralized in CVA, §4.1): rest = surface-1, hover = surface-2, pressed = surface-3 — so a new component inherits the affordance by referencing the scale, never by re-picking palette numbers. (Setup of the four-step CSS architecture and dark-mode provider is out of scope — see the Tailwind-setup skill.)

---

## Area 4 — Supporting best practices

### 4.1 CVA (class-variance-authority) variant API

CVA defines `base` classes + named `variants` + `compoundVariants` + `defaultVariants`, with `VariantProps<typeof x>` giving free TypeScript types (cva.style API reference). It powers shadcn's variant system.

**Structure (encode Area-3 tokens here):**
```ts
const button = cva(
  "inline-flex items-center rounded-md text-ui-sm transition-colors",
  {
    variants: {
      variant: {
        solid:  "bg-accent text-white hover:bg-accent/90",
        soft:   "bg-accent-soft text-accent hover:bg-sub",   // relative elevation
        ghost:  "bg-pane hover:bg-sub active:bg-sub/80",
      },
      size: { sm: "h-8 px-3", md: "h-10 px-4" },
    },
    compoundVariants: [
      { variant: "soft", size: "sm", class: "…" }, // combination-specific
    ],
    defaultVariants: { variant: "ghost", size: "md" },
  },
);
```
Conventions:
- **`base`** = structural/always-on classes; per-variant entries hold the elevation/state tokens.
- **`compoundVariants`** = styles that apply only for a *combination* (e.g. `variant: "solid", disabled: true`). Use them for cross-variant rules; arrays match multiple values.
- **`defaultVariants`** = the default each variant takes; set `null` to opt out.
- **Boolean variants** (`disabled: { true, false }`) are supported.
- **Naming:** keep variant axes orthogonal (`variant`/`size`/`tone`), values short and semantic. Keep one CVA per component, colocated.
- **Variant vs separate component:** add a *variant* when the element, semantics, and a11y role are identical and only styling differs; create a *separate component* when the ARIA role, DOM element, or behavior changes (don't make a "link variant" of a button — that crosses the Area-2 button/link line).
- Always finish with `cn(button({variant,size}), className)` so callers can override (next section).

### 4.2 `cn()` / tailwind-merge semantics and the bespoke-token gotcha

shadcn's `cn()` = `twMerge(clsx(inputs))`. tailwind-merge resolves conflicting Tailwind classes by keeping the **last** class in a conflict group (`twMerge('px-2 p-4') → 'p-4'`), giving order-independent overrides so a caller's `className` wins predictably.

**Version applicability:** use **tailwind-merge v3** with Tailwind v4. Verbatim from the tailwind-merge v3.0.0 release notes (dcastil, GitHub #518): *"This release drops support for Tailwind CSS v3 and in turn adds support for Tailwind CSS v4. That means you should upgrade to Tailwind CSS v4 and tailwind-merge v3 together,"* and *"Theme scales keys changed and now match Tailwind CSS v4 theme variable namespace exactly."* The current release is **tailwind-merge v3.6.0** (npm, last published ~May 2026); its npm README states: *"Supports Tailwind v4.0 up to v4.3 (if you use Tailwind v3, use tailwind-merge v2.6.0)."*

**THE GOTCHA — tailwind-merge doesn't know your custom utilities by default.** Per the tailwind-merge configuration docs, the default `twMerge` only works if you stick to default scales (plus color *names*). It will fail to de-dupe conflicts among **custom font-size tokens** and other modified scales:
- **`text-ui-*` (custom font sizes): MUST configure.** `text-*` is a single conflict group; an unknown `text-ui-sm` won't be recognized as conflicting with `text-base`, so `cn('text-base','text-ui-sm')` may keep both. Fix via `extendTailwindMerge` registering the `--text-*` keys:
  ```ts
  import { extendTailwindMerge } from "tailwind-merge";
  export const twMerge = extendTailwindMerge({
    extend: { theme: { text: ["ui-sm", "ui-base", "ui-lg"] } },
  });
  ```
  (Docs example: `--text-huge` → `theme: { text: ['huge'] }` makes `twMerge('text-lg text-huge') → 'text-huge'`.)
- **Custom *colors*: NO config needed.** The tailwind-merge docs are explicit: custom colors in the `--color-*` namespace *"do not need to be configured… The library uses a permissive validator that accepts any color name,"* so `twMerge('bg-blue-500 bg-accent-soft') → 'bg-accent-soft'` works out of the box. (This means `bg-pane`/`bg-sub`/`bg-accent-soft` merge correctly *if defined as colors*.)
- **Custom non-color surface *utilities* (e.g. an `@utility` you author that isn't a color): MUST configure** — register a new class group (and any cross-group conflicts) via `extendTailwindMerge`'s `classGroups`/`conflictingClassGroups`. Authoring custom CSS classes (e.g. `@apply`) that pass through tailwind-merge is discouraged by the docs; keep reusable class strings in JS variables instead, or register the group.
- **Other knobs:** `override` (replace defaults), `createTailwindMerge` (full custom config), `conflictingClassGroups` for asymmetric conflicts (e.g. `px` overrides `pr`/`pl`). Call `extendTailwindMerge` **once** at module top level (it builds a large structure) and add TS generics for new group IDs.

**Contested / edge-case flags:** whether a given bespoke utility needs registration depends on whether it lands in an existing namespace (colors: no; font-size and bespoke utilities: yes) — when unsure, write a quick `twMerge('conflicting-a conflicting-b')` test. Keeping a runtime tailwind-merge config in sync with build-time `@theme` is manual; the maintainer explicitly recommends *not* feeding the whole Tailwind config into the browser bundle.

---

## Recommendations (staged, with change-thresholds)

**Stage 1 — Make the silent failures impossible (do first).**
1. Add the `aria-pressed`/`aria-checked` rule to review: grep for `data-[state=` on any primitive that is an `asChild` child of another stateful primitive (Tooltip/Popover/Dialog triggers around Toggle/Switch/Checkbox). Convert those to ARIA-keyed styling (§1.4a). *Threshold to revisit:* if protospy ever moves to Base UI (`render` prop instead of Slot), this whole class of merge-collision changes — re-audit.
2. Configure `cn()` with `extendTailwindMerge` registering `text-ui-*` (and any non-color surface utilities) **today** — this is a correctness bug, not a nicety (§4.2). *Threshold:* any new bespoke utility namespace → add it to the merge config in the same PR.
3. Enforce the controlled-prop pairing lint rule: a controlled prop (`open`/`value`/`pressed`/`checked`) without its `onXChange` is a defect (§1.2).

**Stage 2 — Codify selection + token discipline.**
4. Adopt the §2.2 matrix as the canonical "which primitive" reference; require a one-line semantic justification in PRs when a control's primitive isn't obvious (especially Switch-vs-Checkbox, button-vs-link, menu-vs-listbox).
5. Refactor component variants to express interaction states as elevation steps on the `surface-*`/`pane`/`sub` scale via CVA (§3, §4.1). *Threshold:* any new `hover:bg-<palette>-NNN` / `active:bg-<palette>-NNN` in a PR should be rejected in favor of a surface token.

**Stage 3 — Keep it current.**
6. Pin tailwind-merge to v3.x and upgrade in lockstep with Tailwind minor releases (v3.6.0 ⇒ Tailwind ≤ v4.3 today). *Threshold:* upgrading Tailwind past the tailwind-merge-supported ceiling requires bumping tailwind-merge first.
7. Re-verify the Radix packaging assumption each shadcn upgrade (unified `radix-ui` is current default; a future Base UI default would invalidate Area 1's Slot-specific guidance).

## Caveats

- **Genuinely contested, document the tradeoff rather than mandating:** Switch-vs-Checkbox for settings (APG calls them "functionally interchangeable"; screen-reader support is inconsistent per Roselli; the ARIA spec mapping is unsettled per w3c/aria-practices #1327). protospy's default (Switch for immediate on/off) is a reasonable convention, not a settled truth.
- **`data-state` overwrite** is a long-standing open discussion (#560), not an official "bug fix" — the ARIA-keyed workaround is community/maintainer-endorsed, not a documented Radix API. Validate after Radix upgrades.
- **tailwind-merge custom-token edge cases:** the color-vs-font-size asymmetry (colors auto-work, font-sizes don't) is per current docs; behavior for *bespoke non-color utilities* depends on exact namespace and should be unit-tested with a `twMerge()` assertion rather than assumed.
- **Some supporting citations are secondary** (DEV/Medium/blog posts corroborating primary docs); all load-bearing claims trace to primary sources (radix-ui.com, ui.shadcn.com, tailwindcss.com, w3.org APG, cva.style, tailwind-merge repo, Radix Colors, GitHub Primer). Primer's generic `control-bgColor-*` trio comes from the official `primer/primitives` DESIGN_TOKENS_GUIDE.md, which reads partly as authoring guidance — token names are consistent with Primer's published component tables.
- **Version-sensitive throughout (June 2026):** shadcn `new-york` = unified `radix-ui` (Feb 2026); tailwind-merge v3.6.0 supports Tailwind ≤ v4.3; React 19 lets `asChild` children accept `ref` as a prop (no `forwardRef` needed). Re-check these on any major dependency bump.