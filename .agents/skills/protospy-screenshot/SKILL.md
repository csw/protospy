---
name: protospy-screenshot
description: >-
  Capture protospy UI screenshots correctly — fully-rendered content (not
  loading skeletons), the right theme actually active, and canonical filenames.
  Use this whenever you drive the protospy UI with playwright-cli to take an
  ad-hoc or exploratory screenshot: a one-off capture of a view, a qa/visual
  evidence shot, or a state reached by interaction. It is especially important
  when the shot includes a body pane (request/response body, JSON tree,
  compressed or image body), which decodes asynchronously and screenshots far
  too easily mid-skeleton, and whenever a shot's theme matters. Reach for it even
  if the user just says "screenshot the inspector" or "grab a picture of the body
  view". (The PR pixel-regression diff is automated in CI — see below — so this
  skill is for the human-driven shots, not the regression baseline.)
---

# Capturing protospy UI screenshots

A correct protospy screenshot needs three things that are each easy to get wrong
by hand: rendered content (not a loading skeleton), the intended theme actually
active, and — for a named scene — the canonical filename
`{scene}-{width}-{theme}.png`. **The bundled scripts in `scripts/agents/` bake
these in**, so drive them rather than re-implementing the rules. Every script
needs a `playwright-cli` session already pointed at the running UI, reused across
the whole pass.

## The pixel regression is automated — not your job here

The PR visual diff (the full fixture matrix, before vs after, pixel-compared)
runs in **CI** via reg-suit, not from this skill. On a pull request — including a
**draft** — the `ui-visual-regression` workflow captures every scene through the
pinned Playwright Chromium, compares against the S3 baseline, and the reg-viz
GitHub App posts a diff report (PR comment + commit status). You do **not**
capture before/after sets or run a local diff for the PR. Read
`docs/agents/screenshots.md` for how that flow works and how to read its result.

This skill covers the **human-driven** shots that automation doesn't: a one-off
capture, an evidence shot during exploratory QA, a state reached by interaction.

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
