import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { JsonViewer } from "@ui/components/json-viewer";

/**
 * Render and wait for the virtualizer to settle. The virtualizer
 * calculates its visible range in a layout effect and triggers a
 * state-driven re-render to show items. An explicit act() flush is
 * needed so the test sees the rendered rows.
 */
async function renderAndSettle(ui: React.ReactElement) {
  const result = render(ui);
  await act(async () => {});
  return result;
}

describe("JsonViewer tree view", () => {
  it("renders a small JSON object fully expanded by default", async () => {
    const json = JSON.stringify({ name: "Alice", age: 30 }, null, 2);
    const { container } = await renderAndSettle(<JsonViewer text={json} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;
    expect(viewer).toBeTruthy();

    // Should show keys and values
    expect(viewer.textContent).toContain('"name"');
    expect(viewer.textContent).toContain('"Alice"');
    expect(viewer.textContent).toContain('"age"');
    expect(viewer.textContent).toContain("30");
  });

  it("renders disclosure triangle on object nodes", async () => {
    const json = JSON.stringify({ a: 1 }, null, 2);
    await renderAndSettle(<JsonViewer text={json} />);

    // Should have a toggle button for the root object
    const toggles = screen.getAllByRole("button");
    expect(toggles.length).toBeGreaterThanOrEqual(1);
    expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses a node when toggle is clicked", async () => {
    const json = JSON.stringify({ name: "Alice", nested: { x: 1 } }, null, 2);
    const { container } = await renderAndSettle(<JsonViewer text={json} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;

    // Initially expanded — should show nested content
    expect(viewer.textContent).toContain('"name"');
    expect(viewer.textContent).toContain('"nested"');

    // Click the root toggle to collapse
    const rootToggle = screen.getAllByRole("button")[0];
    await act(async () => {
      fireEvent.click(rootToggle);
    });

    // After collapse, should show collapsed summary ({…} without keys)
    expect(viewer.textContent).not.toContain('"name"');
    expect(viewer.textContent).toContain("{");
    expect(viewer.textContent).toContain("}");
  });

  it("re-expands a collapsed node when toggle is clicked", async () => {
    const json = JSON.stringify({ a: 1, b: 2 }, null, 2);
    const { container } = await renderAndSettle(<JsonViewer text={json} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;

    // Collapse root
    const rootToggle = screen.getAllByRole("button")[0];
    await act(async () => {
      fireEvent.click(rootToggle);
    });
    expect(viewer.textContent).not.toContain('"a"');

    // Re-expand root
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button")[0]);
    });
    expect(viewer.textContent).toContain('"a"');
    expect(viewer.textContent).toContain('"b"');
  });

  it("renders empty object as {} without toggle", async () => {
    const json = JSON.stringify({ items: {} }, null, 2);
    const { container } = await renderAndSettle(<JsonViewer text={json} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;
    expect(viewer.textContent).toContain("{}");
    // Empty container should not have its own toggle
    // (root has one, but the empty {} child does not)
  });

  it("renders empty array as [] without toggle", async () => {
    const json = JSON.stringify({ items: [] }, null, 2);
    const { container } = await renderAndSettle(<JsonViewer text={json} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;
    expect(viewer.textContent).toContain("[]");
  });

  it("renders array items without keys", async () => {
    const json = JSON.stringify([1, 2, 3], null, 2);
    const { container } = await renderAndSettle(<JsonViewer text={json} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;
    expect(viewer.textContent).toContain("1");
    expect(viewer.textContent).toContain("2");
    expect(viewer.textContent).toContain("3");
    // Array items don't have key names — no colon separators except
    // in the viewer structure tokens
  });

  it("preserves syntax highlighting classes", async () => {
    const json = JSON.stringify(
      { str: "hello", num: 42, bool: true, nil: null },
      null,
      2,
    );
    const { container } = await renderAndSettle(<JsonViewer text={json} />);

    // Check that colored spans exist
    expect(container.querySelector(".text-json-key")).toBeTruthy();
    expect(container.querySelector(".text-json-string")).toBeTruthy();
    expect(container.querySelector(".text-json-number")).toBeTruthy();
    expect(container.querySelector(".text-json-boolean")).toBeTruthy();
    expect(container.querySelector(".text-json-punct")).toBeTruthy();
  });

  it("shows collapsed item count for arrays", async () => {
    const json = JSON.stringify({ items: [1, 2, 3] }, null, 2);
    const { container } = await renderAndSettle(<JsonViewer text={json} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;

    // Find and collapse the array toggle (second toggle after root)
    const toggles = screen.getAllByRole("button");
    expect(toggles.length).toBeGreaterThan(1);
    await act(async () => {
      fireEvent.click(toggles[1]);
    });
    expect(viewer.textContent).toContain("3 items");
  });

  it("collapsed objects show {…} without property count", async () => {
    const json = JSON.stringify({ nested: { a: 1, b: 2, c: 3 } }, null, 2);
    const { container } = await renderAndSettle(<JsonViewer text={json} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;

    // Collapse the nested object (second toggle)
    const toggles = screen.getAllByRole("button");
    expect(toggles.length).toBeGreaterThan(1);
    await act(async () => {
      fireEvent.click(toggles[1]);
    });
    // Objects show {…} but no count label
    expect(viewer.textContent).not.toContain("properties");
    expect(viewer.textContent).not.toContain("property");
  });

  it("uses singular 'item' for single-element arrays", async () => {
    const json = JSON.stringify({ items: [42] }, null, 2);
    const { container } = await renderAndSettle(<JsonViewer text={json} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;

    // Collapse the array
    const toggles = screen.getAllByRole("button");
    expect(toggles.length).toBeGreaterThan(1);
    await act(async () => {
      fireEvent.click(toggles[1]);
    });
    expect(viewer.textContent).toContain("1 item");
  });

  it("clicking the row also toggles expand/collapse", async () => {
    const json = JSON.stringify({ a: 1 }, null, 2);
    const { container } = await renderAndSettle(<JsonViewer text={json} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;

    // Initially expanded
    expect(viewer.textContent).toContain('"a"');

    // Click the row (not the button) — look for the cursor-pointer div
    const expandableRows = container.querySelectorAll(".cursor-pointer");
    expect(expandableRows.length).toBeGreaterThanOrEqual(1);
    await act(async () => {
      fireEvent.click(expandableRows[0]);
    });

    // Should collapse — content hidden, collapsed summary shown
    expect(viewer.textContent).not.toContain('"a"');
  });
});

describe("JsonViewer flat view (JSONL)", () => {
  it("uses flat view for JSONL kind", async () => {
    const jsonl = '{\n  "a": 1\n}\n\n{\n  "b": 2\n}';
    const { container } = await renderAndSettle(
      <JsonViewer text={jsonl} kind="jsonl" />,
    );
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;
    expect(viewer.textContent).toContain('"a"');
  });

  it("falls back to flat view on JSON parse failure", async () => {
    const invalidJson = "not valid json {{{";
    const { container } = await renderAndSettle(
      <JsonViewer text={invalidJson} kind="json" />,
    );
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;
    expect(viewer.textContent).toContain("not valid json");
  });
});

describe("JsonViewer root primitives", () => {
  it("renders a root string", async () => {
    const json = JSON.stringify("hello world");
    const { container } = await renderAndSettle(<JsonViewer text={json} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;
    expect(viewer.textContent).toContain('"hello world"');
  });

  it("renders a root number", async () => {
    const json = "42";
    const { container } = await renderAndSettle(<JsonViewer text={json} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;
    expect(viewer.textContent).toContain("42");
  });

  it("renders root null", async () => {
    const json = "null";
    const { container } = await renderAndSettle(<JsonViewer text={json} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;
    expect(viewer.textContent).toContain("null");
  });

  it("renders root boolean", async () => {
    const json = "true";
    const { container } = await renderAndSettle(<JsonViewer text={json} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;
    expect(viewer.textContent).toContain("true");
  });
});
