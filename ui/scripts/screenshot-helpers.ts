/**
 * screenshot-helpers.ts
 *
 * Shared Playwright helpers for the screenshot-capture pipelines
 * (take-screenshots.ts, take-bestiary.ts).
 */

import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Loading states in the UI mark themselves with `aria-busy="true"` — the
 * standard "this region is still resolving" signal (see
 * docs/ui/design-system.md §4.5). Keying the wait on `aria-busy` — rather than
 * on a particular loading *form* (the body pane's skeleton, the lifecycle
 * spinner, the "Awaiting response…" text) — means it covers every current and
 * future loading indicator without enumerating them, and it stays correct as
 * indicators change shape. It deliberately ignores terminal states (no body,
 * undecodable) and the UI's *intentional* `animate-pulse`/`animate-spin`
 * animations (live-stream dot, connecting indicator, streaming cursor), none of
 * which are busy regions — so a naive animation-class selector would hang on
 * them while this does not.
 */
const BUSY_SELECTOR = '[aria-busy="true"]';

/**
 * Wait until no loading (`aria-busy`) regions remain in `target` before
 * capturing a screenshot, so captures show rendered content rather than a
 * half-decoded body pane. `target` can be the whole page or a clipped region
 * (e.g. a tabpanel locator the bestiary screenshots).
 *
 * This is content-presence based, not a fixed sleep: a busy region clears the
 * moment its content commits, so `toHaveCount(0)` resolves as soon as the body
 * has rendered (and immediately when nothing was ever loading). Call it *after*
 * the surface that owns the body has mounted — e.g. after the inspector
 * tabpanel is visible — so the busy marker, if any, is already in the DOM and we
 * don't race past it before it mounts.
 */
export async function waitForContentSettled(
  target: Page | Locator,
  { timeoutMs = 15_000 }: { timeoutMs?: number } = {},
): Promise<void> {
  await expect(target.locator(BUSY_SELECTOR)).toHaveCount(0, {
    timeout: timeoutMs,
  });
}
