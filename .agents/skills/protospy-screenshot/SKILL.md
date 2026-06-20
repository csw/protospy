---
name: protospy-screenshot
description: >-
  Capture protospy UI screenshots correctly — fully-rendered content (not
  loading skeletons), the right theme actually active, and canonical filenames.
  Use this whenever you drive the protospy UI with playwright-cli to take a
  screenshot: the before/after sets for a PR, a one-off capture of a view, or any
  qa/visual evidence shot. It is especially important when the shot includes a
  body pane (request/response body, JSON tree, compressed or image body), which
  decodes asynchronously and screenshots far too easily mid-skeleton, and
  whenever a shot's theme matters. Reach for it even if the user just says
  "screenshot the inspector" or "grab a picture of the body view".
---

# Capturing protospy UI screenshots

A correct protospy screenshot needs three things that are each easy to get wrong
by hand: rendered content (not a loading skeleton), the intended theme actually
active, and the canonical filename `{scene}-{width}-{theme}.png`. **The bundled
scripts in `scripts/agents/` bake all three in**, so drive them rather than
re-implementing the rules. Every script needs a `playwright-cli` session already
pointed at the running UI, reused across the whole pass.

## One shot: `capture-shot`

```bash
scripts/agents/capture-shot --scene exchanges-active --theme dark --width 1280 \
  --out scratch/before
# prints: exchanges-active-1280-dark.png
```

It applies the fixture scene, activates and verifies the theme, waits for body
content to settle, guards that the live theme matches the filename, and saves the
canonical name — all in a single `playwright-cli` call. `--theme` is `light` or
`dark`. List scene ids with `scripts/agents/scene-list` (or see
`ui/docs/fixture-matrix.md`).

## Before/after PR set

The flow captures the **whole** scene set for each app version and diffs them, so
there is **no spec to write** and nothing to scope by hand. The before pass runs
against the **base app** (the merge-base with main) and is **cached by base
commit**; the after pass runs against your HEAD. A view this branch adds appears
only in the after set, one it removes only in the before set — `compare-screenshots`
derives new vs removed automatically. This works standalone, not only inside
`handle-ticket`.

**1. Implement the change first.**

**2. Start the HEAD dev server** on a non-default port:

```bash
cd ui && pnpm dev --port 5174 &
```

**3. Capture the before set from the base app.** One command handles the whole
base-app lifecycle (throwaway worktree, its own dev server, teardown) and caches
the result by base commit, so later review cycles and fresh sessions reuse it for
free:

```bash
scripts/agents/capture-before-base --out scratch/before
```

**4. Point playwright at HEAD and capture the after set.** Step 3 repoints
playwright at the (now torn-down) base server, so re-open HEAD first:

```bash
playwright-cli open "http://localhost:5174/"
scripts/agents/capture-matrix --out scratch/after
```

**5. Compare** — emits the ready-to-paste `## Visual diff` PR section:

```bash
scripts/agents/compare-screenshots scratch/before scratch/after \
  --branch "$(git branch --show-current)" --expected changed
```

`compare-screenshots` classifies the full set, links an interactive
visual-diff report carrying every shot (differences highlighted), and inline-embeds
**only the scenes that changed** (so a 45-scene set doesn't flood the PR). Pass
`--expected changed` or `--expected unchanged` (your judgment: a redesign expects
changes, a refactor does not); on a mismatch it prepends a `> [!CAUTION]` block
and exits 3 so the discrepancy can't slip into the PR unnoticed.

Kill the dev server when done (`pkill -f 'pnpm dev'`). The full set is captured at
1280×dark; for a ticket that needs other dimensions (a non-default width, light
theme), pass `--spec scratch/matrix.txt` (one `scene width theme` cell per line)
to `capture-before-base` and `capture-matrix` instead of the full set. The
PR-description and S3 details are in `docs/agents/screenshots.md`.

## Ad-hoc and exploratory captures

For a shot the before/after flow doesn't fit — an evidence shot during
exploratory QA, a state reached by interaction rather than a named scene — drive
the two rules with the same helpers:

```bash
scripts/agents/set-theme dark        # activate + verify a theme
# ... select an exchange / reach the state you want ...
scripts/agents/wait-settled          # wait for body content to finish loading
playwright-cli screenshot --filename=scratch/inspector.png
```

`set-theme <light|dark|system>` and `wait-settled` each verify/wait in the
current session. Order matters: run `wait-settled` **after** the surface owning
the body has mounted — run it before and the wait passes instantly, then you
screenshot the skeleton that appears a moment later. To capture and upload a
whole set in one step (not the PR flow), `capture-pass --out <dir> --branch <b>`.

## Deliberately capturing a loading state

To document the loading UX, screenshot the skeleton itself: skip `wait-settled`
and capture directly with `playwright-cli screenshot`. This is the one case where
capturing a skeleton is correct.
