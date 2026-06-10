import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { toast } from "sonner";
import { CopyButton } from "@ui/components/protospy/copy-button";
import { TooltipProvider } from "@ui/components/ui/tooltip";

// The copy-button fires feedback through `sonner`; assert on the emission
// rather than rendering the real toast host.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderButton(props: { value?: string } = {}) {
  return render(
    <TooltipProvider>
      <CopyButton {...props} />
    </TooltipProvider>,
  );
}

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
    renderButton();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is enabled when value is provided", () => {
    renderButton({ value: "hello" });
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("shows the copy icon initially", () => {
    renderButton({ value: "hello" });
    const btn = screen.getByRole("button");
    expect(copyIcon(btn)).toBeInTheDocument();
    expect(checkIcon(btn)).not.toBeInTheDocument();
  });

  it("copies the value and fires a success toast on click", async () => {
    renderButton({ value: "hello world" });
    const btn = screen.getByRole("button");
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(mockWriteText).toHaveBeenCalledWith("hello world");
    expect(toast.success).toHaveBeenCalledWith("Copied to clipboard");
  });

  it("swaps to the check icon after a successful copy", async () => {
    renderButton({ value: "hello" });
    const btn = screen.getByRole("button");
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(checkIcon(btn)).toBeInTheDocument();
    expect(copyIcon(btn)).not.toBeInTheDocument();
  });

  it("reverts to the copy icon after 2 seconds", async () => {
    vi.useFakeTimers();
    try {
      renderButton({ value: "hello" });
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

  it("fires an error toast and stays on the copy icon when the write rejects", async () => {
    mockWriteText.mockRejectedValueOnce(new Error("denied"));
    renderButton({ value: "hello" });
    const btn = screen.getByRole("button");
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(toast.error).toHaveBeenCalledWith("Couldn't copy to clipboard");
    expect(toast.success).not.toHaveBeenCalled();
    expect(copyIcon(btn)).toBeInTheDocument();
    expect(checkIcon(btn)).not.toBeInTheDocument();
  });

  it("does nothing when clicked while disabled (no value)", () => {
    renderButton();
    fireEvent.click(screen.getByRole("button"));
    expect(mockWriteText).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("copies on keyboard activation (Enter via native button click)", async () => {
    renderButton({ value: "keyboard" });
    const btn = screen.getByRole("button") as HTMLButtonElement;
    btn.focus();
    // Native <button> translates Enter keydown into a click event.
    await act(async () => {
      fireEvent.keyDown(btn, { key: "Enter", code: "Enter" });
      fireEvent.click(btn);
    });
    expect(mockWriteText).toHaveBeenCalledWith("keyboard");
    expect(checkIcon(btn)).toBeInTheDocument();
  });
});
