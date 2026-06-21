---
name: protospy-screenshot
description: >-
  Capture protospy UI screenshots correctly — fully-rendered content (not
  loading skeletons), the right theme actually active, and canonical filenames.
  Use whenever you drive the protospy UI with playwright-cli for an ad-hoc,
  exploratory, or QA-evidence screenshot — a one-off view, a body-pane shot, a
  theme-specific shot, or a state reached by interaction — even if the user just
  says "screenshot the inspector". Not for the PR pixel-regression baseline,
  which runs automatically in CI.
---

# Capturing protospy UI screenshots

A correct protospy screenshot needs three things that are each easy to get wrong
by hand: rendered content (not a loading skeleton), the intended theme actually
active, and — for a named scene — the canonical filename
`{scene}-{width}-{theme}.png`. **The bundled scripts in `scripts/agents/` bake
these in**, so drive them rather than re-implementing the rules. Every script
needs a `playwright-cli` session already pointed at the running UI, reused across
the whole pass.

## Not the PR pixel diff

The PR visual regression (full fixture matrix, pixel-compared) runs automatically
in CI via reg-suit — you do **not** capture before/after sets or diff by hand for
a PR (see `docs/agents/screenshots.md`). This skill is only for **human-driven**
shots: a one-off capture, exploratory-QA evidence, or a state reached by
interaction.

## One shot: `capture-shot`

```bash
scripts/agents/capture-shot --scene exchanges-active --theme dark --width 1280 \
  --out scratch/shots
# prints: exchanges-active-1280-dark.png
```

It applies the fixture scene, activates and verifies the theme, waits for body
content to settle, guards that the live theme matches the filename, and saves the
canonical name — all in a single `playwright-cli` call. `--theme` is `light` or
`dark`. List scene ids with `scripts/agents/scene-list` (or see
`ui/docs/fixture-matrix.md`).

## Ad-hoc and exploratory captures

For a shot a named scene doesn't fit — an evidence shot during exploratory QA, a
state reached by interaction rather than a named scene — drive the two rules with
the same helpers:

```bash
scripts/agents/set-theme dark        # activate + verify a theme
# ... select an exchange / reach the state you want ...
scripts/agents/wait-settled          # wait for body content to finish loading
playwright-cli screenshot --filename=scratch/inspector.png
```

`set-theme <light|dark|system>` and `wait-settled` each verify/wait in the
current session. Order matters: run `wait-settled` **after** the surface owning
the body has mounted — run it before and the wait passes instantly, then you
screenshot the skeleton that appears a moment later.

## Deliberately capturing a loading state

To document the loading UX, screenshot the skeleton itself: skip `wait-settled`
and capture directly with `playwright-cli screenshot`. This is the one case where
capturing a skeleton is correct.

## Sharing a shot

To attach a shot to a PR or review comment, upload it with
`scripts/agents/upload-screenshot` (prints a Markdown image embed) — see
`docs/agents/screenshots.md`.
