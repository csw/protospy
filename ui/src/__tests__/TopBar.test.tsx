import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { render } from "@ui/test/render";
import { TopBar } from "@ui/components/TopBar";
import { useStore } from "@ui/state/store";
import type { Service } from "@ui/api/info";

const services: Service[] = [
  {
    name: "api",
    addr: "0.0.0.0:8080",
    target: "http://localhost:8080",
    protocol: null,
    subscribers: 0,
  },
  {
    name: "web",
    addr: "0.0.0.0:3000",
    target: "http://localhost:3000",
    protocol: null,
    subscribers: 0,
  },
];

function renderTopBar(onSwitchService = vi.fn()) {
  render(<TopBar services={services} onSwitchService={onSwitchService} />);
  return { onSwitchService };
}

describe("TopBar control buttons", () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true);
  });

  // The ticket's core regression: the hand-rolled control buttons had no
  // focus ring. Adopting the shadcn primitives gives every control a
  // focus-visible ring. The two binary controls are `Toggle`s (ring-2
  // ring-ring); the stateless/3-state controls are `Button`s (ring-ring/50).
  // Guard that each renders a real <button> with a visible focus ring.
  it("renders every control with a visible focus-visible ring", () => {
    useStore.setState({ service: "api" });
    renderTopBar();

    const toggles = [
      screen.getByLabelText("Group by trace"),
      screen.getByLabelText("Toggle density"),
    ];
    for (const control of toggles) {
      expect(control.tagName).toBe("BUTTON");
      expect(control).toHaveClass("focus-visible:ring-ring");
    }

    const buttons = [
      screen.getByLabelText(/^Theme:/),
      screen.getByRole("button", { name: /Jump to/ }),
      screen.getByRole("button", { name: /api/ }), // service-picker trigger
    ];
    for (const control of buttons) {
      expect(control.tagName).toBe("BUTTON");
      expect(control).toHaveClass("focus-visible:ring-ring/50");
    }
  });

  // The two binary controls are Radix `Toggle`s wrapped in a
  // `TooltipTrigger asChild`. The trigger's own `data-state` (open/closed)
  // overwrites the Toggle's `data-state` on the merged element, so we assert
  // pressed semantics via `aria-pressed` — which Radix Toggle manages and the
  // tooltip never touches. (The visible pressed fill is driven off
  // `aria-pressed` too; its rendering is covered by design-tokens.spec.ts.)
  describe("trace group toggle", () => {
    it("reflects store state via aria-pressed and toggles it on click", () => {
      renderTopBar();
      const btn = screen.getByLabelText("Group by trace");

      expect(btn).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(btn);
      expect(useStore.getState().traceGroupOn).toBe(true);
      expect(btn).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(btn);
      expect(useStore.getState().traceGroupOn).toBe(false);
      expect(btn).toHaveAttribute("aria-pressed", "false");
    });
  });

  describe("density toggle", () => {
    it("flips density between regular and compact, reflecting it via aria-pressed", () => {
      useStore.setState({ density: "regular" });
      renderTopBar();
      const btn = screen.getByLabelText("Toggle density");

      // Closes the a11y gap the plain Button had: density now exposes a
      // pressed state ("compact" is pressed) via the Toggle primitive.
      expect(btn).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(btn);
      expect(useStore.getState().density).toBe("compact");
      expect(btn).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(btn);
      expect(useStore.getState().density).toBe("regular");
      expect(btn).toHaveAttribute("aria-pressed", "false");
    });

    it("keeps a constant aria-label across states (APG toggle-button rule)", () => {
      useStore.setState({ density: "regular" });
      renderTopBar();
      const btn = screen.getByLabelText("Toggle density");

      fireEvent.click(btn);
      // Label must not change with state; the tooltip carries the next action.
      expect(screen.getByLabelText("Toggle density")).toBe(btn);
    });
  });

  describe("theme toggle", () => {
    it("cycles dark → light → system → dark", () => {
      useStore.setState({ theme: "dark" });
      renderTopBar();
      const btn = screen.getByLabelText(/^Theme:/);

      fireEvent.click(btn);
      expect(useStore.getState().theme).toBe("light");

      fireEvent.click(btn);
      expect(useStore.getState().theme).toBe("system");

      fireEvent.click(btn);
      expect(useStore.getState().theme).toBe("dark");
    });
  });

  describe("jump-to command palette opener", () => {
    it("opens the command palette on click", () => {
      renderTopBar();
      const btn = screen.getByRole("button", { name: /Jump to/ });

      expect(useStore.getState().cmdKOpen).toBe(false);
      fireEvent.click(btn);
      expect(useStore.getState().cmdKOpen).toBe(true);
    });
  });

  describe("service picker trigger", () => {
    it("renders as a dropdown-menu button showing the active service", () => {
      useStore.setState({ service: "api" });
      renderTopBar();
      const trigger = screen.getByRole("button", { name: /api/ });

      // Focus ring is covered by the all-controls test above; here we assert
      // the dropdown-trigger semantics survive the asChild Button.
      expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    });
  });
});
