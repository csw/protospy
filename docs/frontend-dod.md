# Frontend Definition of Done

This is the bar a UI change must clear before it's "done." It complements — does
not restate — the **design-review rubric** (`/design-review` skill), which is the
general visual-quality bar (layout, typography, colour, hierarchy, component
consistency, interaction design, responsive quality). The rubric handles general
craft; this document adds the protospy-specific requirements the rubric doesn't
know about.

## Layer 1 — Pass the design-review rubric

The change must pass the seven categories in the `/design-review` skill. Don't
duplicate them here; run the skill. This is an action you must take before
reporting the change complete, not a standard to self-assess against: actually
invoke `/design-review` (or the `visual-review` subagent) on your change. Do not
report done having only reasoned about whether it would pass. If it fails, it
isn't done.

## Layer 2 — protospy-specific requirements

These are the requirements the rubric can't check on its own, because they depend
on protospy's state model, supported widths, and runtime behaviour.

1. **All fixture-matrix states render correctly.** Inject and visually verify
   *each* cell listed in `ui/docs/fixture-matrix.md` — not only the states your
   change obviously touched. Every cell of the state +
   data-size matrix — driven through injection, not live traffic — must render
   without breakage: empty, loading, error row (`ERR`), selected, hover; long URI
   path / long query, very long status or error text, many rows, dual wire/decoded
   size labels; rows vs. table mode, compact vs. regular density, list pane at min
   vs. wide. The matrix is codified in `ui/src/test/scenes.ts` and reachable via
   the dev-only `window.__test_scenes` harness (`apply('<scene-id>')`); the full
   cell list and injection calls are in `ui/docs/fixture-matrix.md`. The rubric
   doesn't know protospy's state model; you have to drive it.

2. **Target widths are 1280 / 1440 / 1920 — desktop only.** protospy is
   desktop-only (≥1280). Check the window fixed at **1280** (minimum supported),
   **1440** (baseline), and **1920** (wide). There is no mobile or tablet target;
   below 1280 is unsupported. The "narrow" axis that matters is the **list pane**
   (its resizable `minSize`), not the window.

3. **No clipping without an expand affordance or tooltip.** This is stricter than
   the rubric's general truncation guidance: protospy routinely shows long URIs,
   query strings, and error text. Any value that's clipped must offer a way to see
   it in full — an expand affordance or a tooltip (`title`). Silent cut-off is a
   defect, not just an aesthetic issue.

4. **Pane sizing stays within bounds.** The list pane respects sensible min/max
   width bounds. No wasted empty space at wide widths, and no cut-off content at
   narrow widths or when the pane is dragged to its minimum.

5. **No new console errors.** This is a technical check, not a visual one: the
   browser console must not gain new errors or warnings as a result of the change.
   Treat *any* new console output as a defect; the most common offenders are
   React key warnings, act() warnings, Radix/aria warnings, persist-hydration
   warnings, and uncaught exceptions during state transitions, but the bar is
   zero new warnings of any kind.

6. **Dark mode and light mode both checked.** The rubric calls for this too, but
   it's worth restating: protospy is dark-first, so light mode is the one that
   regresses unnoticed. Verify both themes.

7. **Keyboard and focus stay usable.** The UI is keyboard-driven. Focus rings stay
   visible and focus order stays sane. (Broader a11y is advisory — axe runs
   non-blocking via `ui/browser/a11y.spec.ts`; don't chase axe violations beyond
   keeping focus and keyboard usable.)
