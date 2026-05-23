import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { subscribe } from "@ui/lib/tickSource";

describe("tickSource", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls listener on each tick", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    vi.advanceTimersByTime(3000);

    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it("starts exactly one interval for multiple subscribers", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();

    const ua = subscribe(a);
    const ub = subscribe(b);
    const uc = subscribe(c);

    expect(spy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);

    ua();
    ub();
    uc();
    spy.mockRestore();
  });

  it("stops the interval when the last subscriber unsubscribes", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    unsubscribe();

    expect(clearSpy).toHaveBeenCalledTimes(1);

    // No further calls after unsubscribe
    vi.advanceTimersByTime(5000);
    expect(listener).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("restarts the interval when a new subscriber arrives after all unsubscribed", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    const a = vi.fn();
    const b = vi.fn();

    const ua = subscribe(a);
    ua();

    const ub = subscribe(b);
    ub();

    // Two separate lifecycle starts → two setInterval calls
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("unsubscribing one of many listeners keeps the interval running", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const a = vi.fn();
    const b = vi.fn();

    const ua = subscribe(a);
    const ub = subscribe(b);

    ua(); // remove one, but b is still subscribed
    expect(clearSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(b).toHaveBeenCalledTimes(1);

    ub(); // last one — now it clears
    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });
});
