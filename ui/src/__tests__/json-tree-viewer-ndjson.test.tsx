import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { JsonTreeViewer } from "@ui/components/json-tree";

// Copy feedback fires through `sonner`; assert on the clipboard call rather than
// rendering the toast host.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

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

const viewerOf = (container: HTMLElement, label: string) =>
  container.querySelector(`[aria-label="${label}"]`) as HTMLElement;

// Radix Menu drives selection through pointer-capture APIs jsdom lacks.
beforeAll(() => {
  const proto = Element.prototype as unknown as {
    hasPointerCapture?: () => boolean;
    setPointerCapture?: () => void;
    releasePointerCapture?: () => void;
  };
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
});

describe("JsonTreeViewer — NDJSON documents (PRO-400)", () => {
  it("renders one collapsed document per line with a numbered gutter", async () => {
    const { container } = await renderAndSettle(
      <JsonTreeViewer
        documents={[{ a: 1 }, { b: 2 }, { c: 3 }]}
        aria-label="NDJSON viewer"
      />,
    );
    const viewer = viewerOf(container, "NDJSON viewer");
    // Each document is collapsed by default → three one-key count badges.
    expect(viewer.querySelectorAll("*")).toBeTruthy();
    expect(viewer.textContent).toContain("1 key");
    // Document gutter shows 1-based numbers for each document.
    expect(viewer.textContent).toContain("1");
    expect(viewer.textContent).toContain("2");
    expect(viewer.textContent).toContain("3");
    // Collapsed by default: the values themselves are hidden.
    expect(viewer.textContent).not.toContain('"a"');
  });

  it("expands one document without expanding the others", async () => {
    const { container } = await renderAndSettle(
      <JsonTreeViewer
        documents={[{ a: 1 }, { b: 2 }]}
        aria-label="NDJSON viewer"
      />,
    );
    const viewer = viewerOf(container, "NDJSON viewer");
    const toggles = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(toggles[0]);
    });
    expect(viewer.textContent).toContain('"a"');
    // The second document stays collapsed.
    expect(viewer.textContent).not.toContain('"b"');
  });
});

describe("JsonTreeViewer — truncation (PRO-400)", () => {
  it("renders the truncation banner above the tree", async () => {
    await renderAndSettle(
      <JsonTreeViewer value={{ a: 1 }} truncated aria-label="JSON viewer" />,
    );
    const banner = screen.getByTestId("json-truncation-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/truncated/i);
  });

  it("marks the deepest rightmost node as the cut point", async () => {
    await renderAndSettle(
      <JsonTreeViewer
        value={{ a: 1, b: { c: 2 } }}
        truncated
        aria-label="JSON viewer"
      />,
    );
    // The marker renders at the auto-expanded truncation path (root → b → c → 2).
    expect(screen.getByTestId("json-truncation-marker")).toBeInTheDocument();
  });

  it("shows no banner or marker for a complete body", async () => {
    await renderAndSettle(
      <JsonTreeViewer value={{ a: 1 }} aria-label="JSON viewer" />,
    );
    expect(
      screen.queryByTestId("json-truncation-banner"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("json-truncation-marker"),
    ).not.toBeInTheDocument();
  });
});

describe("JsonTreeViewer — copy value / copy path (PRO-400)", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  /** Right-click the row carrying `text` and return the opened menu. */
  async function openMenuOnRow(text: string) {
    const row = screen.getByText(text).closest("[data-index]")!;
    await act(async () => {
      fireEvent.contextMenu(row);
    });
  }

  it("copies a node's JSONPath-style path", async () => {
    await renderAndSettle(
      <JsonTreeViewer value={{ a: 1, b: 2 }} aria-label="JSON viewer" />,
    );
    await openMenuOnRow('"a"');
    await act(async () => {
      fireEvent.click(screen.getByText("Copy path"));
    });
    expect(writeText).toHaveBeenCalledWith("$.a");
  });

  it("copies a node's pretty-printed value", async () => {
    await renderAndSettle(
      <JsonTreeViewer
        value={{ outer: { x: 1, y: 2 } }}
        aria-label="JSON viewer"
      />,
    );
    await openMenuOnRow('"x"');
    await act(async () => {
      fireEvent.click(screen.getByText("Copy value"));
    });
    expect(writeText).toHaveBeenCalledWith("1");
  });

  it("clears the target on an empty-space right-click (no stale copy)", async () => {
    // Regression: the single menu is hoisted above the scroll container, so a
    // right-click on empty space must not act on whichever row was targeted last.
    const { container } = await renderAndSettle(
      <JsonTreeViewer value={{ a: 1, b: 2 }} aria-label="JSON viewer" />,
    );
    // Target a row, then right-click the scroll container's empty space.
    await openMenuOnRow('"a"');
    const scroll = viewerOf(container, "JSON viewer");
    await act(async () => {
      fireEvent.contextMenu(scroll);
    });
    // The menu now reflects no target: copy items are disabled and selecting
    // them is a no-op (before the fix the stale row's "$.a" would be copied).
    const copyValue = screen
      .getByText("Copy value")
      .closest('[role="menuitem"]');
    expect(copyValue).toHaveAttribute("aria-disabled", "true");
    await act(async () => {
      fireEvent.click(screen.getByText("Copy path"));
    });
    expect(writeText).not.toHaveBeenCalled();
  });
});
