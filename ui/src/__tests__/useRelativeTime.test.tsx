import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { useRelativeTime } from "@ui/hooks/useRelativeTime";

function Wrapper({ timestamp }: { timestamp: string }) {
  const rel = useRelativeTime(timestamp);
  return <span data-testid="ts">{rel}</span>;
}

describe("useRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("returns 'now' immediately after injection of a current timestamp", () => {
    const ts = new Date(Date.now()).toISOString();
    render(<Wrapper timestamp={ts} />);
    expect(screen.getByTestId("ts").textContent).toBe("now");
  });

  it("updates to '5s' after 5 seconds have elapsed", () => {
    const ts = new Date(Date.now()).toISOString();
    render(<Wrapper timestamp={ts} />);
    expect(screen.getByTestId("ts").textContent).toBe("now");

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId("ts").textContent).toBe("5s");
  });

  it("updates to '1m' after 60 seconds have elapsed", () => {
    const ts = new Date(Date.now()).toISOString();
    render(<Wrapper timestamp={ts} />);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByTestId("ts").textContent).toBe("1m");
  });

  it("returns correct value for a timestamp already 2 minutes in the past", () => {
    const ts = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    render(<Wrapper timestamp={ts} />);
    expect(screen.getByTestId("ts").textContent).toBe("2m");
  });

  it("cleans up the interval on unmount without error", () => {
    const ts = new Date(Date.now()).toISOString();
    const { unmount } = render(<Wrapper timestamp={ts} />);
    unmount();
    // Advancing timers after unmount should not throw
    expect(() => act(() => vi.advanceTimersByTime(5000))).not.toThrow();
  });

  it("uses a single shared interval for multiple mounted components", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const ts = new Date(Date.now()).toISOString();

    const { unmount: u1 } = render(<Wrapper timestamp={ts} />);
    const { unmount: u2 } = render(<Wrapper timestamp={ts} />);
    const { unmount: u3 } = render(<Wrapper timestamp={ts} />);

    // Only one interval should have been created across all three components
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    u1();
    u2();
    u3();
    setIntervalSpy.mockRestore();
  });
});
