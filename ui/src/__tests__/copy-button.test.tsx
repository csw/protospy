import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { toast } from "sonner";
import { render } from "@ui/test/render";
import { CopyButton } from "@ui/components/copy-button";

// The copy-button fires feedback through `sonner`; assert on the emission
// rather than rendering the real toast host. The shared `render` wraps the
// button in the app's TooltipProvider, matching production context.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function copyIcon(btn: HTMLElement) {
  return btn.querySelector(".lucide-copy");
}
function checkIcon(btn: HTMLElement) {
  return btn.querySelector(".lucide-check");
}

describe("CopyButton", () => {
  let mockWriteText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockWriteText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: mockWriteText } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("is disabled when value is undefined", () => {
    render(<CopyButton />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is enabled when value is provided", () => {
    render(<CopyButton value="hello" />);
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("shows the copy icon and 'Copy' label initially", () => {
    render(<CopyButton value="hello" />);
    const btn = screen.getByRole("button");
    expect(copyIcon(btn)).toBeInTheDocument();
    expect(checkIcon(btn)).not.toBeInTheDocument();
    // sr-only label reflects the resting state.
    expect(btn).toHaveAccessibleName("Copy");
  });

  it("copies the value and fires a success toast on click", async () => {
    render(<CopyButton value="hello world" />);
    const btn = screen.getByRole("button");
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(mockWriteText).toHaveBeenCalledWith("hello world");
    expect(toast.success).toHaveBeenCalledWith("Copied to clipboard", {
      id: "copy-feedback",
    });
  });

  it("swaps to the check icon and 'Copied' label after a successful copy", async () => {
    render(<CopyButton value="hello" />);
    const btn = screen.getByRole("button");
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(checkIcon(btn)).toBeInTheDocument();
    expect(copyIcon(btn)).not.toBeInTheDocument();
    expect(btn).toHaveAccessibleName("Copied");
  });

  it("reverts to the copy icon after 2 seconds", async () => {
    vi.useFakeTimers();
    try {
      render(<CopyButton value="hello" />);
      const btn = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(btn);
        // flush the awaited clipboard write before the revert timer is armed
        await Promise.resolve();
      });
      expect(checkIcon(btn)).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(copyIcon(btn)).toBeInTheDocument();
      expect(checkIcon(btn)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the pending revert timer on unmount", async () => {
    vi.useFakeTimers();
    try {
      const clearSpy = vi.spyOn(globalThis, "clearTimeout");
      const { unmount } = render(<CopyButton value="hello" />);
      const btn = screen.getByRole("button");
      await act(async () => {
        fireEvent.click(btn);
        await Promise.resolve();
      });
      // The successful copy armed the 2s revert timer.
      expect(checkIcon(btn)).toBeInTheDocument();
      unmount();
      // The effect cleanup tears the timer down rather than firing a
      // setState on an unmounted component.
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fires an error toast and stays on the copy icon when the write rejects", async () => {
    mockWriteText.mockRejectedValueOnce(new Error("denied"));
    render(<CopyButton value="hello" />);
    const btn = screen.getByRole("button");
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(toast.error).toHaveBeenCalledWith("Couldn't copy to clipboard", {
      id: "copy-feedback",
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(copyIcon(btn)).toBeInTheDocument();
    expect(checkIcon(btn)).not.toBeInTheDocument();
  });

  it("does nothing when clicked while disabled (no value)", () => {
    render(<CopyButton />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockWriteText).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  describe("onCopy override", () => {
    it("is enabled when onCopy is provided even without value", () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      render(<CopyButton onCopy={handler} />);
      expect(screen.getByRole("button")).not.toBeDisabled();
    });

    it("calls onCopy instead of writeText on click", async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      render(<CopyButton onCopy={handler} />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button"));
      });
      expect(handler).toHaveBeenCalledOnce();
      expect(mockWriteText).not.toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalled();
    });

    it("fires error toast when onCopy rejects", async () => {
      const handler = vi.fn().mockRejectedValueOnce(new Error("denied"));
      render(<CopyButton onCopy={handler} />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button"));
      });
      expect(toast.error).toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
});
