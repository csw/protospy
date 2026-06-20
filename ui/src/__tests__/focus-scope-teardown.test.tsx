import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui/components/ui/dialog";
import { flushFocusScopeTeardown } from "@ui/test/flush-focus-scope-teardown";

/**
 * PRO-350: a Radix overlay (Dialog/DropdownMenu/…) mounts a FocusScope whose
 * unmount cleanup schedules a deferred `setTimeout(0)` that dispatches a
 * refocus CustomEvent. React Testing Library's `cleanup()` unmounts
 * synchronously without running that timer, so it leaks past the test and,
 * intermittently, fires after the jsdom realm is torn down — throwing a
 * `dispatchEvent` TypeError and failing the suite with ELIFECYCLE.
 *
 * These tests pin the contract our shared teardown (src/test/setup.ts) relies
 * on: the deferred timer exists, and flushing a macrotask after unmount drains
 * it deterministically while the realm is still alive.
 */
const AUTOFOCUS_ON_UNMOUNT = "focusScope.autoFocusOnUnmount";

function renderOpenDialog() {
  return render(
    <Dialog defaultOpen>
      <DialogContent>
        <DialogTitle>title</DialogTitle>
        <DialogDescription>desc</DialogDescription>
      </DialogContent>
    </Dialog>,
  );
}

describe("Radix FocusScope deferred-unmount teardown (PRO-350)", () => {
  it("leaves the refocus dispatch pending after unmount, drained by a macrotask flush", async () => {
    const dispatched: string[] = [];
    const realDispatch = Element.prototype.dispatchEvent;
    const spy = vi
      .spyOn(Element.prototype, "dispatchEvent")
      .mockImplementation(function (this: Element, event: Event) {
        dispatched.push(event.type);
        return realDispatch.call(this, event);
      });

    try {
      const { unmount } = renderOpenDialog();
      unmount();

      // Radix scheduled the refocus dispatch on a setTimeout(0); cleanup()'s
      // synchronous unmount has not run it yet.
      expect(dispatched).not.toContain(AUTOFOCUS_ON_UNMOUNT);

      await flushFocusScopeTeardown();

      // The flush drained the queued timer while the realm is still alive — the
      // exact discipline that keeps the leaked timer from firing post-teardown.
      expect(dispatched).toContain(AUTOFOCUS_ON_UNMOUNT);
    } finally {
      spy.mockRestore();
    }
  });

  it("drains the deferred timer without throwing", async () => {
    const { unmount } = renderOpenDialog();
    unmount();
    await expect(flushFocusScopeTeardown()).resolves.toBeUndefined();
  });
});
