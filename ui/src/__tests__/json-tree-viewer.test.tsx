import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { JsonTreeViewer } from "@ui/components/json-tree/json-tree-viewer";

/**
 * Render and let the virtualizer settle. It computes its visible range in a
 * layout effect and triggers a state-driven re-render; an explicit act() flush
 * lets the test see the rendered rows.
 */
async function renderAndSettle(ui: React.ReactElement) {
  const result = render(ui);
  await act(async () => {});
  return result;
}

const viewerOf = (container: HTMLElement) =>
  container.querySelector('[aria-label="JSON tree viewer"]')!;

describe("JsonTreeViewer", () => {
  it("renders a parsed object standalone, fully expanded for a small tree", async () => {
    const { container } = await renderAndSettle(
      <JsonTreeViewer value={{ name: "Alice", age: 30 }} />,
    );
    const viewer = viewerOf(container);
    expect(viewer).toBeInTheDocument();
    expect(viewer).toHaveTextContent('"name"');
    expect(viewer).toHaveTextContent('"Alice"');
    expect(viewer).toHaveTextContent('"age"');
    expect(viewer).toHaveTextContent("30");
  });

  it("renders a disclosure toggle expanded by default on the root", async () => {
    await renderAndSettle(<JsonTreeViewer value={{ a: 1 }} />);
    const toggles = screen.getAllByRole("button");
    expect(toggles.length).toBeGreaterThanOrEqual(1);
    expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses and re-expands a node via its toggle", async () => {
    const { container } = await renderAndSettle(
      <JsonTreeViewer value={{ a: 1, b: 2 }} />,
    );
    const viewer = viewerOf(container);
    expect(viewer).toHaveTextContent('"a"');

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button")[0]);
    });
    expect(viewer).not.toHaveTextContent('"a"');

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button")[0]);
    });
    expect(viewer).toHaveTextContent('"a"');
    expect(viewer).toHaveTextContent('"b"');
  });

  it("clicking the row toggles expand/collapse", async () => {
    const { container } = await renderAndSettle(
      <JsonTreeViewer value={{ a: 1 }} />,
    );
    const viewer = viewerOf(container);
    const rows = container.querySelectorAll(".cursor-pointer");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    await act(async () => {
      fireEvent.click(rows[0]);
    });
    expect(viewer).not.toHaveTextContent('"a"');
  });

  it("renders empty containers inline without a toggle", async () => {
    const { container } = await renderAndSettle(
      <JsonTreeViewer value={{ obj: {}, arr: [] }} />,
    );
    const viewer = viewerOf(container);
    expect(viewer).toHaveTextContent("{}");
    expect(viewer).toHaveTextContent("[]");
    // Only the root is expandable
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("applies type-based highlighting classes", async () => {
    const { container } = await renderAndSettle(
      <JsonTreeViewer value={{ str: "hi", num: 42, bool: true, nil: null }} />,
    );
    expect(container.querySelector(".text-json-key")).toBeInTheDocument();
    expect(container.querySelector(".text-json-string")).toBeInTheDocument();
    expect(container.querySelector(".text-json-number")).toBeInTheDocument();
    expect(container.querySelector(".text-json-boolean")).toBeInTheDocument();
    expect(container.querySelector(".text-json-null")).toBeInTheDocument();
    expect(container.querySelector(".text-json-punct")).toBeInTheDocument();
  });

  it("shows an item count on a collapsed array", async () => {
    const { container } = await renderAndSettle(
      <JsonTreeViewer value={{ items: [1, 2, 3] }} />,
    );
    const viewer = viewerOf(container);
    // toggles: [0] root, [1] items array
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button")[1]);
    });
    expect(viewer).toHaveTextContent("3 items");
  });

  it("shows a key count on a collapsed object", async () => {
    const { container } = await renderAndSettle(
      <JsonTreeViewer value={{ nested: { a: 1, b: 2, c: 3 } }} />,
    );
    const viewer = viewerOf(container);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button")[1]);
    });
    expect(viewer).toHaveTextContent("3 keys");
  });

  it("uses singular labels for single-element containers", async () => {
    const { container } = await renderAndSettle(
      <JsonTreeViewer value={{ arr: [42], obj: { only: 1 } }} />,
    );
    const viewer = viewerOf(container);
    const toggles = screen.getAllByRole("button"); // [0] root, [1] arr, [2] obj
    await act(async () => {
      fireEvent.click(toggles[1]);
      fireEvent.click(toggles[2]);
    });
    expect(viewer).toHaveTextContent("1 item");
    expect(viewer).toHaveTextContent("1 key");
  });

  it("resets expansion when a different value is rendered", async () => {
    const { container, rerender } = await renderAndSettle(
      <JsonTreeViewer value={{ a: { b: 1 } }} />,
    );
    const viewer = viewerOf(container);
    // Collapse the root
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button")[0]);
    });
    expect(viewer).not.toHaveTextContent('"a"');

    // New value → fresh default expansion
    await act(async () => {
      rerender(<JsonTreeViewer value={{ x: { y: 2 } }} />);
    });
    expect(viewer).toHaveTextContent('"x"');
  });
});
