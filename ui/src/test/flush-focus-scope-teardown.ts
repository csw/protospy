/**
 * Drain the deferred refocus timer that `@radix-ui/react-focus-scope` schedules
 * in its unmount cleanup.
 *
 * On unmount, FocusScope's effect cleanup runs `setTimeout(() => { ...
 * container.dispatchEvent(unmountEvent) ... }, 0)` to restore focus
 * (see the package's `dist/index.mjs`). React Testing Library's `cleanup()`
 * unmounts synchronously, so that timer is *scheduled* but not *run* before the
 * test returns. Left pending, it fires after Vitest tears down the jsdom realm,
 * where `dispatchEvent` no longer recognises the realm's `CustomEvent` as an
 * `Event`:
 *
 *   TypeError: Failed to execute 'dispatchEvent' on 'EventTarget':
 *     parameter 1 is not of type 'Event'.
 *
 * which surfaces as an intermittent unhandled error and `ELIFECYCLE` suite
 * failure (PRO-350).
 *
 * Awaiting a macrotask after `cleanup()` lets the already-queued `setTimeout(0)`
 * run while the realm is still alive, making teardown deterministic. This is a
 * targeted root-cause flush of exactly this leaked-timer failure mode — not a
 * blanket retry.
 */
export function flushFocusScopeTeardown(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
