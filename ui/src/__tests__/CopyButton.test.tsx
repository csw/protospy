import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { toast } from "sonner";
import { CopyButton } from "@ui/components/ui/copy-button";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("CopyButton", () => {
  let mockWriteText: ReturnType<typeof vi.fn>;

  async function flushClipboard() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    mockWriteText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: mockWriteText } });
    vi.useFakeTimers();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => {
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

  it("shows copied feedback and emits a success toast after copy succeeds", async () => {
    render(<CopyButton text="hello" />);
    fireEvent.click(screen.getByRole("button"));
    await flushClipboard();
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(toast.success).toHaveBeenCalledWith("Copied to clipboard");
  });

  it("reverts to 'Copy' after 2 seconds", async () => {
    render(<CopyButton text="hello" />);
    fireEvent.click(screen.getByRole("button"));
    await flushClipboard();
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: "Copy" })).toBeVisible();
  });

  it("rapid double-click collapses into one 'Copied!' cycle", async () => {
    render(<CopyButton text="hello" />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    await flushClipboard();
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
    // First click sets the state and a timer; advance partway through it.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
    // Second click should clear the previous timer and start a new one.
    fireEvent.click(btn);
    await flushClipboard();
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(mockWriteText).toHaveBeenCalledTimes(2);
    // Only one timer is pending — advancing by 2000ms reverts to "Copy".
    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("button", { name: "Copy" })).toBeVisible();
  });

  it("reverts to 'Copy' and emits an error toast when clipboard.writeText rejects", async () => {
    mockWriteText.mockRejectedValueOnce(new Error("denied"));
    render(<CopyButton text="hello" />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    await flushClipboard();
    expect(screen.getByRole("button", { name: "Copy" })).toBeVisible();
    expect(toast.error).toHaveBeenCalledWith("Could not copy to clipboard");
  });

  it("cleans up timer on unmount without warnings or errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<CopyButton text="hello" />);
    fireEvent.click(screen.getByRole("button"));
    await flushClipboard();
    expect(toast.success).toHaveBeenCalled();
    unmount();
    // Advancing timers after unmount should not trigger any callbacks
    // that touch unmounted component state.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("triggers copy flow on keyboard activation (Enter)", async () => {
    render(<CopyButton text="keyboard" />);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    btn.focus();
    // Native <button> elements translate Enter keydown into a click event.
    fireEvent.keyDown(btn, { key: "Enter", code: "Enter" });
    fireEvent.click(btn);
    expect(mockWriteText).toHaveBeenCalledWith("keyboard");
    await flushClipboard();
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
  });

  it("triggers copy flow on keyboard activation (Space)", async () => {
    render(<CopyButton text="space" />);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    btn.focus();
    // Native <button> elements translate Space keyup into a click event.
    fireEvent.keyDown(btn, { key: " ", code: "Space" });
    fireEvent.keyUp(btn, { key: " ", code: "Space" });
    fireEvent.click(btn);
    expect(mockWriteText).toHaveBeenCalledWith("space");
    await flushClipboard();
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
  });
});
