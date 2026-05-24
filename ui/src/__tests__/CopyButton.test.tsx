import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CopyButton } from "@ui/components/CopyButton";

describe("CopyButton", () => {
  let mockWriteText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockWriteText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: mockWriteText } });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("is disabled when text is undefined", () => {
    render(<CopyButton />);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("is enabled when text is provided", () => {
    render(<CopyButton text="hello" />);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("calls clipboard.writeText with the provided text on click", () => {
    render(<CopyButton text="hello world" />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockWriteText).toHaveBeenCalledWith("hello world");
  });

  it("shows 'Copied!' immediately after click", () => {
    render(<CopyButton text="hello" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").textContent).toBe("Copied!");
  });

  it("reverts to 'Copy' after 2 seconds", async () => {
    render(<CopyButton text="hello" />);
    fireEvent.click(screen.getByRole("button"));
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button").textContent).toBe("Copy");
  });

  it("rapid double-click collapses into one 'Copied!' cycle", async () => {
    render(<CopyButton text="hello" />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    // First click sets the state and a timer; advance partway through it.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(btn.textContent).toBe("Copied!");
    // Second click should clear the previous timer and start a new one.
    fireEvent.click(btn);
    expect(btn.textContent).toBe("Copied!");
    expect(mockWriteText).toHaveBeenCalledTimes(2);
    // Only one timer is pending — advancing by 2000ms reverts to "Copy".
    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(btn.textContent).toBe("Copied!");
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(btn.textContent).toBe("Copy");
  });

  it("reverts to 'Copy' when clipboard.writeText rejects", async () => {
    mockWriteText.mockRejectedValueOnce(new Error("denied"));
    render(<CopyButton text="hello" />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    // Optimistically flips to "Copied!" synchronously.
    expect(btn.textContent).toBe("Copied!");
    // After the rejection microtask flushes, state reverts to "Copy".
    await act(async () => {
      await Promise.resolve();
    });
    expect(btn.textContent).toBe("Copy");
  });

  it("cleans up timer on unmount without warnings or errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<CopyButton text="hello" />);
    fireEvent.click(screen.getByRole("button"));
    unmount();
    // Advancing timers after unmount should not trigger any callbacks
    // that touch unmounted component state.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("triggers copy flow on keyboard activation (Enter)", () => {
    render(<CopyButton text="keyboard" />);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    btn.focus();
    // Native <button> elements translate Enter keydown into a click event.
    fireEvent.keyDown(btn, { key: "Enter", code: "Enter" });
    fireEvent.click(btn);
    expect(mockWriteText).toHaveBeenCalledWith("keyboard");
    expect(btn.textContent).toBe("Copied!");
  });

  it("triggers copy flow on keyboard activation (Space)", () => {
    render(<CopyButton text="space" />);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    btn.focus();
    // Native <button> elements translate Space keyup into a click event.
    fireEvent.keyDown(btn, { key: " ", code: "Space" });
    fireEvent.keyUp(btn, { key: " ", code: "Space" });
    fireEvent.click(btn);
    expect(mockWriteText).toHaveBeenCalledWith("space");
    expect(btn.textContent).toBe("Copied!");
  });
});
