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
  // focus ring. Adopting Button gives every control the primitive's
  // focus-visible ring. Guard that it is present on each converted control.
  it("renders every control with the Button focus-visible ring", () => {
    renderTopBar();

    const controls = [
      screen.getByLabelText("Group by trace"),
      screen.getByLabelText("Toggle density"),
      screen.getByLabelText(/^Theme:/),
      screen.getByRole("button", { name: /Jump to/ }),
    ];

    for (const control of controls) {
      expect(control.tagName).toBe("BUTTON");
      expect(control).toHaveClass("focus-visible:ring-ring/50");
    }
  });

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

    it("applies the pressed styling only when active", () => {
      renderTopBar();
      const btn = screen.getByLabelText("Group by trace");

      expect(btn).not.toHaveClass("bg-accent-soft");
      fireEvent.click(btn);
      expect(btn).toHaveClass("bg-accent-soft");
    });
  });

  describe("density toggle", () => {
    it("flips density between regular and compact", () => {
      useStore.setState({ density: "regular" });
      renderTopBar();
      const btn = screen.getByLabelText("Toggle density");

      fireEvent.click(btn);
      expect(useStore.getState().density).toBe("compact");

      fireEvent.click(btn);
      expect(useStore.getState().density).toBe("regular");
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

      expect(trigger).toHaveAttribute("aria-haspopup", "menu");
      expect(trigger).toHaveClass("focus-visible:ring-ring/50");
    });
  });
});
