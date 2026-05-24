import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import type { EventMessage } from "@bindings/EventMessage";
import { CommandPalette } from "@ui/components/CommandPalette";
import { useStore } from "@ui/state/store";
import { makeGetRequest } from "@ui/test/fixtures";

// cmdk (via Radix) uses ResizeObserver, which jsdom does not implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("CommandPalette", () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true);
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    // cmdk calls scrollIntoView on its selected item; jsdom does not
    // implement it on HTMLElement.
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = function () {};
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not render palette content when cmdKOpen is false", () => {
    render(<CommandPalette />);
    // Radix Dialog only mounts content when open; the "Toggle dark mode"
    // item should not appear in the DOM at all.
    expect(screen.queryByText("Toggle dark mode")).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search exchanges…"),
    ).not.toBeInTheDocument();
  });

  it("renders the input and command items when cmdKOpen is true", () => {
    useStore.getState().setCmdKOpen(true);
    render(<CommandPalette />);

    const input = screen.getByPlaceholderText("Search exchanges…");
    expect(input).toBeInTheDocument();

    // Assert the input is the only combobox/textbox-style element. cmdk's
    // Input renders as role="combobox", so search for both roles.
    const comboboxes = screen.queryAllByRole("combobox");
    const textboxes = screen.queryAllByRole("textbox");
    expect(comboboxes.length + textboxes.length).toBe(1);

    expect(screen.getByText("Toggle dark mode")).toBeInTheDocument();
  });

  it("filters the rendered list when the user types", async () => {
    // Inject an exchange so the Exchanges section has a non-matching item.
    useStore
      .getState()
      .applyEvent(
        makeGetRequest(42, "/api/widgets") as unknown as EventMessage,
      );
    useStore.getState().setCmdKOpen(true);
    render(<CommandPalette />);

    // Before typing, the exchange row is rendered.
    expect(screen.getByText("/api/widgets")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Search exchanges…");
    await act(async () => {
      fireEvent.change(input, { target: { value: "toggle" } });
    });

    // After filtering, a matching command item is still present...
    await waitFor(() => {
      expect(screen.getByText("Toggle dark mode")).toBeInTheDocument();
    });
    // ...and a non-matching exchange item is gone.
    await waitFor(() => {
      expect(screen.queryByText("/api/widgets")).not.toBeInTheDocument();
    });
  });

  it("selecting an exchange row sets selectedId and closes the palette", async () => {
    useStore
      .getState()
      .applyEvent(
        makeGetRequest(42, "/api/widgets") as unknown as EventMessage,
      );
    useStore.getState().setCmdKOpen(true);
    render(<CommandPalette />);

    const row = screen.getByText("/api/widgets");
    await act(async () => {
      fireEvent.click(row);
    });

    await waitFor(() => {
      expect(useStore.getState().selectedId).toBe(42);
    });
    expect(useStore.getState().cmdKOpen).toBe(false);
  });

  it("clicking 'Toggle dark mode' flips darkMode and closes the palette", async () => {
    useStore.getState().setCmdKOpen(true);
    expect(useStore.getState().darkMode).toBe(false);
    render(<CommandPalette />);

    const item = screen.getByText("Toggle dark mode");
    await act(async () => {
      fireEvent.click(item);
    });

    await waitFor(() => {
      expect(useStore.getState().darkMode).toBe(true);
    });
    expect(useStore.getState().cmdKOpen).toBe(false);
  });
});
