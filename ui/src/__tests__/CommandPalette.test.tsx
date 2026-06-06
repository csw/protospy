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
    // Radix Dialog only mounts content when open; theme items should not
    // appear in the DOM at all.
    expect(screen.queryByText("Dark mode")).not.toBeInTheDocument();
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

    // Three theme options should be visible
    expect(screen.getByText("Light mode")).toBeInTheDocument();
    expect(screen.getByText("Dark mode")).toBeInTheDocument();
    expect(screen.getByText("System theme")).toBeInTheDocument();
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
    // Theme items are still present.
    expect(screen.getByText("Dark mode")).toBeInTheDocument();
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
    // Non-matching items are filtered out.
    await waitFor(() => {
      expect(screen.queryByText("Dark mode")).not.toBeInTheDocument();
    });
  });

  it("shows the empty state only when no command matches the query", async () => {
    useStore.getState().setCmdKOpen(true);
    render(<CommandPalette />);

    // cmdk drives empty-state visibility: with matches present (initial render),
    // the no-results copy must be absent. Guards against a regression where the
    // empty state is rendered unconditionally rather than via CommandEmpty.
    expect(screen.queryByText("No results found.")).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText("Search commands…");
    await act(async () => {
      fireEvent.change(input, { target: { value: "zzzznomatch" } });
    });

    // No match → CommandEmpty reveals the shared empty-state treatment.
    await waitFor(() => {
      expect(screen.getByText("No results found.")).toBeInTheDocument();
    });
    // All command items are filtered out.
    expect(screen.queryByText("Dark mode")).not.toBeInTheDocument();
    expect(screen.queryByText("Toggle density")).not.toBeInTheDocument();

    // The no-results copy carries the shared empty-state text treatment
    // (font-ui + the 10.5px text-ui-xs token), not a bare Tailwind default.
    const empty = screen.getByText("No results found.");
    expect(empty).toHaveClass("font-ui", "text-ui-xs", "text-dim");
  });

  it("clicking 'Dark mode' sets theme to dark and closes the palette", async () => {
    useStore.getState().setTheme("light");
    useStore.getState().setCmdKOpen(true);
    render(<CommandPalette />);

    const item = screen.getByText("Dark mode");
    await act(async () => {
      fireEvent.click(item);
    });

    await waitFor(() => {
      expect(useStore.getState().theme).toBe("dark");
    });
    expect(useStore.getState().cmdKOpen).toBe(false);
  });

  it("clicking 'Light mode' sets theme to light and closes the palette", async () => {
    useStore.getState().setTheme("dark");
    useStore.getState().setCmdKOpen(true);
    render(<CommandPalette />);

    const item = screen.getByText("Light mode");
    await act(async () => {
      fireEvent.click(item);
    });

    await waitFor(() => {
      expect(useStore.getState().theme).toBe("light");
    });
    expect(useStore.getState().cmdKOpen).toBe(false);
  });

  it("clicking 'System theme' sets theme to system and closes the palette", async () => {
    useStore.getState().setTheme("dark");
    useStore.getState().setCmdKOpen(true);
    render(<CommandPalette />);

    const item = screen.getByText("System theme");
    await act(async () => {
      fireEvent.click(item);
    });

    await waitFor(() => {
      expect(useStore.getState().theme).toBe("system");
    });
    expect(useStore.getState().cmdKOpen).toBe(false);
  });

  it("marks the active theme with an 'active' indicator", () => {
    useStore.getState().setTheme("dark");
    useStore.getState().setCmdKOpen(true);
    render(<CommandPalette />);

    // The active theme's item should have an "active" label.
    const darkItem = screen.getByText("Dark mode").closest("[cmdk-item]")!;
    expect(darkItem.textContent).toContain("active");

    // The inactive items should not.
    const lightItem = screen.getByText("Light mode").closest("[cmdk-item]")!;
    expect(lightItem.textContent).not.toContain("active");
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

  it("clicking 'Switch to rows view' changes listMode and closes the palette", async () => {
    useStore.getState().setCmdKOpen(true);
    expect(useStore.getState().listMode).toBe("table");
    render(<CommandPalette />);

    const item = screen.getByText("Switch to rows view");
    await act(async () => {
      fireEvent.click(item);
    });

    await waitFor(() => {
      expect(useStore.getState().listMode).toBe("rows");
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

  it("clicking 'Switch to UTC timestamps' toggles timeZone and closes the palette", async () => {
    useStore.getState().setCmdKOpen(true);
    expect(useStore.getState().timeZone).toBe("local");
    render(<CommandPalette />);

    const item = screen.getByText("Switch to UTC timestamps");
    await act(async () => {
      fireEvent.click(item);
    });

    await waitFor(() => {
      expect(useStore.getState().timeZone).toBe("utc");
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
