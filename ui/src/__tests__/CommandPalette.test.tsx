import { describe, it, expect, beforeEach, vi } from "vitest";
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

  it("does not render palette content when cmdKOpen is false", () => {
    render(<CommandPalette />);
    // Radix Dialog only mounts content when open; the "Toggle dark mode"
    // item should not appear in the DOM at all.
    expect(screen.queryByText("Toggle dark mode")).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search commands…"),
    ).not.toBeInTheDocument();
  });

  it("renders the input and command items when cmdKOpen is true", () => {
    useStore.getState().setCmdKOpen(true);
    render(<CommandPalette />);

    const input = screen.getByPlaceholderText("Search commands…");
    expect(input).toBeInTheDocument();

    // Assert the input is the only combobox/textbox-style element. cmdk's
    // Input renders as role="combobox", so search for both roles.
    const comboboxes = screen.queryAllByRole("combobox");
    const textboxes = screen.queryAllByRole("textbox");
    expect(comboboxes.length + textboxes.length).toBe(1);

    expect(screen.getByText("Toggle dark mode")).toBeInTheDocument();
  });

  it("does not show exchange items even when exchanges are in the store", () => {
    useStore
      .getState()
      .applyEvent(
        makeGetRequest(42, "/api/widgets") as unknown as EventMessage,
      );
    useStore.getState().setCmdKOpen(true);
    render(<CommandPalette />);

    // The exchange path must not appear in the command palette.
    expect(screen.queryByText("/api/widgets")).not.toBeInTheDocument();
    // Command items are still present.
    expect(screen.getByText("Toggle dark mode")).toBeInTheDocument();
  });

  it("filters the rendered list when the user types", async () => {
    useStore.getState().setCmdKOpen(true);
    render(<CommandPalette />);

    const input = screen.getByPlaceholderText("Search commands…");
    await act(async () => {
      fireEvent.change(input, { target: { value: "density" } });
    });

    // Matching command item is still visible.
    await waitFor(() => {
      expect(screen.getByText("Toggle density")).toBeInTheDocument();
    });
    // Non-matching command item is filtered out.
    await waitFor(() => {
      expect(screen.queryByText("Toggle dark mode")).not.toBeInTheDocument();
    });
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

  it("clicking 'Toggle density' toggles density and closes the palette", async () => {
    useStore.getState().setCmdKOpen(true);
    expect(useStore.getState().density).toBe("regular");
    render(<CommandPalette />);

    const item = screen.getByText("Toggle density");
    await act(async () => {
      fireEvent.click(item);
    });

    await waitFor(() => {
      expect(useStore.getState().density).toBe("compact");
    });
    expect(useStore.getState().cmdKOpen).toBe(false);
  });

  it("clicking 'Switch to table view' changes listMode and closes the palette", async () => {
    useStore.getState().setCmdKOpen(true);
    expect(useStore.getState().listMode).toBe("rows");
    render(<CommandPalette />);

    const item = screen.getByText("Switch to table view");
    await act(async () => {
      fireEvent.click(item);
    });

    await waitFor(() => {
      expect(useStore.getState().listMode).toBe("table");
    });
    expect(useStore.getState().cmdKOpen).toBe(false);
  });

  it("clicking 'Toggle trace grouping' toggles traceGroup and closes the palette", async () => {
    useStore.getState().setCmdKOpen(true);
    render(<CommandPalette />);

    const item = screen.getByText("Toggle trace grouping");
    await act(async () => {
      fireEvent.click(item);
    });

    await waitFor(() => {
      expect(useStore.getState().traceGroupOn).toBe(true);
    });
    expect(useStore.getState().cmdKOpen).toBe(false);
  });

  it("clicking 'Clear filter' clears the filter and closes the palette", async () => {
    useStore.getState().setFilter("hello");
    useStore.getState().setCmdKOpen(true);
    render(<CommandPalette />);

    const item = screen.getByText("Clear filter");
    await act(async () => {
      fireEvent.click(item);
    });

    await waitFor(() => {
      expect(useStore.getState().filter).toBe("");
    });
    expect(useStore.getState().cmdKOpen).toBe(false);
  });
});
