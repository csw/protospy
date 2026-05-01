// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { CopyButton } from "@ui/components/CopyButton";

describe("CopyButton", () => {
  let mockWriteText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockWriteText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: mockWriteText } });
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
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
});
