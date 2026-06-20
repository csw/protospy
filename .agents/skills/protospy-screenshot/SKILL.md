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

A correct protospy screenshot has three properties that are each easy to get
wrong by hand:

1. **Rendered content, not a skeleton.** The body pane decodes asynchronously —
   JSON parses in a Web Worker, compressed bodies run WASM decoders, images load
   as `<img>`. While that work is in flight the pane shows a loading skeleton,
   and a shot taken then captures the skeleton instead of the content. This is
   the most common defect in protospy captures.
2. **The intended theme actually active.** Theme moved out of the Zustand store
   with the v2.3 next-themes swap (PRO-345); it lives behind the dev-only
   `window.__test_theme` bridge, and both the bridge and the `.dark` class on
   `<html>` are applied by React effects. A `-dark`/`-light` filename is only a
   label — the active theme is whatever was last applied, so it must be set and
   verified, not assumed.
3. **A canonical filename**, `{scene}-{width}-{theme}.png`, so before/after sets
   pair cleanly for pixel comparison and render in the review catalog.

The bundled scripts make all three the default so you don't restate them per
shot.

## The single-shot primitive: `capture-shot`

`scripts/agents/capture-shot` captures one shot with all three properties baked
in — it applies a fixture scene, activates and verifies the theme, waits for body
content to settle, and saves to the canonical filename:

```bash
scripts/agents/capture-shot --scene exchanges-active --theme dark --width 1280 \
  --out scratch/before
# prints: exchanges-active-1280-dark.png
```

It requires a `playwright-cli` session already pointed at the running UI, and
the same session is reused for every shot in a pass. It prints the filename it
produced, so the captured set itself is the manifest.

Scene ids are the fixture-matrix cells (`window.__test_scenes`); list them with
`playwright-cli --raw eval "JSON.stringify(window.__test_scenes.list())"` or see
`ui/docs/fixture-matrix.md`. Pick a scene that puts data in the view the ticket
changes — an empty-state shot rarely shows anything useful.

## Before/after PR capture procedure

This is the flow `handle-ticket` invokes for a UI-labelled ticket. A single
**matrix spec** drives both passes, so they pair by construction — write the spec
once, capture against it before and after.

1. **Write the matrix spec** to `scratch/matrix.txt` — one `scene width theme`
   cell per line (whitespace-separated; `#` comments and blank lines are
   ignored). Choose the minimal set that shows the change: default to one width
   (1280) unless the change affects horizontal layout across widths, and one
   theme (dark) unless it touches theme-specific styling. A grid of unrelated
   pages is less useful to a reviewer than two relevant shots.

   ```
   # scene            width  theme
   exchanges-active   1280   dark
   detail-panel       1280   dark
   ```

2. **Start a dev server** on a non-default port (`cd ui && pnpm dev --port
   <port> &`) and open it in a `playwright-cli` session.
3. **Capture the before set** with `capture-matrix`. It cleans the output dir and
   produces exactly the spec'd cells — derived filenames, no stale artifacts:

   ```bash
   scripts/agents/capture-matrix --spec scratch/matrix.txt --out scratch/before
   ```

4. **Upload**:

   ```bash
   scripts/agents/upload-screenshot scratch/before \
     --branch "$(git branch --show-current)"
   ```

5. **After implementation**, repeat against the **same spec** into `scratch/after`
   (`capture-matrix --spec scratch/matrix.txt --out scratch/after`), upload, then
   **compare**: `scripts/agents/screenshot-diff scratch/before scratch/after`.
   Identical spec ⇒ identical filenames ⇒ the sets pair. See
   `docs/agents/screenshots.md` for the comparison, visual-diff report, and
   PR-description wiring.

Because `capture-matrix` produces exactly the spec, there is no stale-or-missing
mismatch to warn about in the normal flow; `upload-screenshot --matrix` (a
filename manifest) remains a backstop for ad-hoc uploads assembled by hand.

Kill the dev server when the pass is done (`pkill -f 'pnpm dev'`).

## Ad-hoc and exploratory captures

For a shot that `capture-shot` doesn't fit — an evidence shot during exploratory
QA, a state reached by interaction rather than a named scene — drive the two
rules yourself:

- **Theme:** `scripts/agents/set-theme <light|dark|system>` activates and
  verifies a theme in the current session.
- **Content wait:** after the surface owning the body has mounted (i.e. after
  you have selected an exchange and the inspector tabpanel is visible), wait for
  every loading region to clear, then capture:

  ```bash
  playwright-cli run-code "async page => { await page.getByRole('tabpanel').first().waitFor({ state: 'visible' }); await page.locator('[aria-busy=\"true\"]').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}); }"
  playwright-cli screenshot --filename=scratch/inspector.png
  ```

Why key on `aria-busy` rather than "the skeleton" or "anything animating": every
loading state marks its region `aria-busy="true"` (design-system §4.5), so one
check covers the decode skeleton, the lifecycle spinner, the "Awaiting
response…"/"Streaming…" states, and any future indicator — without enumerating
them, and without hanging on terminal states or the UI's intentional animations
(the live-stream dot, the streaming-text cursor), which are not busy regions.
`{ state: 'detached' }` resolves the instant the busy region is replaced by
content and resolves immediately when nothing was loading; the `.catch(() => {})`
keeps a never-present marker from throwing. Order matters: run the wait **after**
the body pane mounts — wait before it mounts and the check passes instantly, then
you screenshot the skeleton that appears a moment later.

## Deliberately capturing a loading state

To screenshot the skeleton itself (documenting the loading UX), skip the content
wait — that's the one case where capturing the skeleton is correct. `capture-shot`
always waits, so take that shot by hand with `playwright-cli screenshot`.
