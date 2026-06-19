---
name: protospy-screenshot
description: >-
  Capture protospy UI screenshots that show fully-rendered content instead of
  loading skeletons. Use this whenever you drive the protospy UI with
  playwright-cli to take a screenshot — before/after shots for a PR, a one-off
  capture of a view, or any qa/visual check — especially when the shot includes
  a body pane (request/response body, JSON tree, compressed or image body),
  since those decode asynchronously and screenshot far too easily mid-skeleton.
  Reach for it even if the user just says "screenshot the inspector" or "grab a
  picture of the body view" without mentioning skeletons or loading.
---

# Capturing protospy UI screenshots

The protospy body pane decodes asynchronously — JSON parses in a Web Worker,
compressed bodies run through WASM decoders, images load as `<img>`. While that
work is in flight the pane shows a **loading skeleton**. A screenshot taken in
that window captures the skeleton instead of the content, which is the most
common defect in protospy captures. This skill exists to make that defect
impossible: wait for content before you shoot.

This covers **ad-hoc, playwright-cli-driven** captures. The scripted pipelines
(`just screenshots`, `just screenshots-bestiary`) already wait via the shared
`waitForContentSettled` helper in `ui/scripts/screenshot-helpers.ts` — you don't
need this skill for those.

## The one rule: wait for `aria-busy` to clear

Every loading state in the UI marks its region with `aria-busy="true"` — the
standard "this region is still resolving" signal (design-system §4.5). So a
single content-presence check covers the body pane's decode skeleton, the
lifecycle spinner, the "Awaiting response…" / "Streaming…" states, and any
future loading indicator without enumerating them — and it stays correct as
those indicators change shape:

```bash
# Wait until no loading region remains, THEN screenshot.
playwright-cli run-code "async page => { await page.locator('[aria-busy=\"true\"]').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}); }"
playwright-cli screenshot --filename=scratch/after/inspector-1280-dark.png
```

Why `aria-busy` and not "the skeleton" or "anything animating": keying on a
particular loading _form_ misses the others (a skeleton selector won't catch a
spinner). Terminal states (no body, undecodable) and the UI's _intentional_
animations (the live-stream dot, the connecting indicator, the streaming-text
cursor) are not busy regions, so `aria-busy` waits for real content and never
hangs on them.

`{ state: 'detached' }` resolves the instant the busy region is replaced by
content, and resolves immediately when nothing was loading — the
`.catch(() => {})` keeps a never-present marker from throwing. It is
content-presence based, not a fixed `sleep`; do not substitute a timeout.

## Order matters

Run the wait **after** the surface that owns the body has mounted — i.e. after
you have selected the exchange and the inspector tabpanel is visible. If you wait
before the body pane mounts, the skeleton isn't in the DOM yet, the check passes
instantly, and you screenshot the skeleton that appears a moment later.

```bash
# 1. Select an exchange so the inspector (and its body pane) mounts.
playwright-cli click "<exchange row>"
# 2. Confirm the body surface is up, then wait for content.
playwright-cli run-code "async page => { await page.getByRole('tabpanel').first().waitFor({ state: 'visible' }); await page.locator('[data-slot=\"skeleton\"]').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}); }"
# 3. Now capture.
playwright-cli screenshot --filename=scratch/after/body-1280-dark.png
```

## Deliberately capturing a loading state

If you actually want a screenshot of the skeleton (documenting the loading UX),
skip the wait — that's the one case where capturing the skeleton is correct.

## Fitting into the standard capture flow

This skill is the "wait for content" step, not a replacement for the rest of the
capture workflow (forcing theme, choosing widths, filenames, upload). For the
full before/after PR flow — shot matrix, `scratch/before` and `scratch/after`,
`upload-screenshot`, `screenshot-diff` — see `docs/agents/screenshots.md` and the
`handle-ticket` skill. Apply the wait above before each shot that includes a body
pane.
