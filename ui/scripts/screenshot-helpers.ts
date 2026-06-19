/**
 * screenshot-helpers.ts
 *
 * Shared Playwright helpers for the screenshot-capture pipelines
 * (take-screenshots.ts, take-bestiary.ts).
 */

import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Loading placeholders in the UI all render through the shadcn `Skeleton`
 * primitive (components/ui/skeleton.tsx), which stamps `data-slot="skeleton"`.
 * Keying the wait on this attribute — rather than on a particular component's
 * skeleton (e.g. the body pane's) — means it covers every current and future
 * loading state without enumerating them, and it deliberately ignores the
 * UI's *intentional* `animate-pulse` animations (live-stream dot, connecting
 * indicator, streaming cursor): those are not loading placeholders and never
 * carry this slot, so a naive animation-class selector would hang on them.
 */
const SKELETON_SELECTOR = '[data-slot="skeleton"]';

/**
 * Wait until no loading skeletons remain in `target` before capturing a
 * screenshot, so captures show rendered content rather than a half-decoded
 * body pane. `target` can be the whole page or a clipped region (e.g. a
 * tabpanel locator the bestiary screenshots).
 *
 * This is content-presence based, not a fixed sleep: a skeleton detaches the
 * moment its content commits, so `toHaveCount(0)` resolves as soon as the body
 * has rendered (and immediately when nothing was ever loading). Call it *after*
 * the surface that owns the body has mounted — e.g. after the inspector
 * tabpanel is visible — so the skeleton, if any, is already in the DOM and we
 * don't race past it before it mounts.
 */
export async function waitForContentSettled(
  target: Page | Locator,
  { timeoutMs = 15_000 }: { timeoutMs?: number } = {},
): Promise<void> {
  await expect(target.locator(SKELETON_SELECTOR)).toHaveCount(0, {
    timeout: timeoutMs,
  });
}
