import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExchangeList } from "@ui/components/ExchangeList";
import { useStore } from "@ui/state/store";

describe("ExchangeList toolbar toggles", () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true);
  });

  describe("order toggle", () => {
    it("reflects order in aria-pressed and flips it on click (oldest = on)", () => {
      render(<ExchangeList />);
      const toggle = screen.getByLabelText("Sort order");
      // Default order is "newest" → not pressed.
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      expect(toggle).toHaveAttribute("data-state", "off");

      fireEvent.click(toggle);
      expect(useStore.getState().order).toBe("oldest");
      expect(toggle).toHaveAttribute("aria-pressed", "true");
      expect(toggle).toHaveAttribute("data-state", "on");

      fireEvent.click(toggle);
      expect(useStore.getState().order).toBe("newest");
      expect(toggle).toHaveAttribute("aria-pressed", "false");
    });

    it("exposes a focus-visible ring (no hand-rolled focus styling)", () => {
      render(<ExchangeList />);
      const toggle = screen.getByLabelText("Sort order");
      expect(toggle.className).toContain("focus-visible:ring-2");
    });
  });

  describe("time zone toggle", () => {
    it("reflects time zone in aria-pressed and flips it on click (utc = on)", () => {
      render(<ExchangeList />);
      const toggle = screen.getByLabelText("Time zone (local/UTC)");
      // Default time zone is "local" → not pressed.
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      expect(toggle).toHaveTextContent("Local");

      fireEvent.click(toggle);
      expect(useStore.getState().timeZone).toBe("utc");
      expect(toggle).toHaveAttribute("aria-pressed", "true");
      expect(toggle).toHaveAttribute("data-state", "on");
      expect(toggle).toHaveTextContent("UTC");

      fireEvent.click(toggle);
      expect(useStore.getState().timeZone).toBe("local");
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      expect(toggle).toHaveTextContent("Local");
    });

    it("uses a constant accessible name regardless of state (APG)", () => {
      render(<ExchangeList />);
      // Name does not change when the underlying zone flips.
      expect(
        screen.getByLabelText("Time zone (local/UTC)"),
      ).toBeInTheDocument();
      useStore.getState().setTimeZone("utc");
      expect(
        screen.getByLabelText("Time zone (local/UTC)"),
      ).toBeInTheDocument();
    });

    it("is hidden in rows mode", () => {
      useStore.getState().setListMode("rows");
      render(<ExchangeList />);
      expect(
        screen.queryByLabelText("Time zone (local/UTC)"),
      ).not.toBeInTheDocument();
    });
  });
});
