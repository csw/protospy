import { describe, it, expect } from "vitest";
import {
  buildJsonTree,
  buildJsonForest,
  type JsonTreeNode,
} from "@ui/components/json-tree/model";
import {
  flattenTree,
  flattenForest,
  formatPrimitive,
  CONTAINER_WINDOW,
} from "@ui/components/json-tree/flatten";

// ── flattenTree: leaves & empty containers ──

describe("flattenTree leaves", () => {
  it("flattens a primitive to one leaf row carrying its path", () => {
    const rows = flattenTree(buildJsonTree(42), new Set());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "leaf",
      depth: 0,
      path: [],
      valueText: "42",
      valueCls: "text-json-number",
      hasComma: false,
      truncated: false,
    });
  });

  it("renders empty object/array inline as a leaf", () => {
    expect(flattenTree(buildJsonTree({}), new Set())[0]).toMatchObject({
      kind: "leaf",
      valueText: "{}",
      valueCls: "text-json-punct",
    });
    expect(flattenTree(buildJsonTree([]), new Set())[0]).toMatchObject({
      kind: "leaf",
      valueText: "[]",
    });
  });
});

// ── collapse/expand + count computation for badges ──

describe("flattenTree collapse and counts", () => {
  it("shows a collapsed object row with its key count", () => {
    const rows = flattenTree(buildJsonTree({ a: 1, b: 2, c: 3 }), new Set());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "collapsed",
      containerType: "object",
      childCount: 3,
    });
  });

  it("shows a collapsed array row with its item count", () => {
    const rows = flattenTree(buildJsonTree([1, 2, 3, 4, 5]), new Set());
    expect(rows[0]).toMatchObject({
      kind: "collapsed",
      containerType: "array",
      childCount: 5,
    });
  });

  it("expands a container into open + children + close", () => {
    const tree = buildJsonTree({ a: 1, b: 2 });
    const rows = flattenTree(tree, new Set([tree.id]));
    expect(rows.map((r) => r.kind)).toEqual(["open", "leaf", "leaf", "close"]);
    expect(rows[0]).toMatchObject({ kind: "open", containerType: "object" });
    expect(rows[3]).toMatchObject({ kind: "close", containerType: "object" });
  });

  it("toggling expansion changes the visible row count", () => {
    const tree = buildJsonTree({ a: 1, b: 2 });
    expect(flattenTree(tree, new Set())).toHaveLength(1);
    expect(flattenTree(tree, new Set([tree.id]))).toHaveLength(4);
  });

  it("shows a collapsed child inside an expanded parent", () => {
    const tree = buildJsonTree({ a: { b: 1 }, c: 2 });
    const rows = flattenTree(tree, new Set([tree.id])); // root expanded only
    expect(rows.map((r) => r.kind)).toEqual([
      "open",
      "collapsed",
      "leaf",
      "close",
    ]);
    expect(rows[1]).toMatchObject({
      key: "a",
      containerType: "object",
      depth: 1,
    });
  });
});

// ── trailing commas ──

describe("flattenTree commas", () => {
  it("adds trailing commas to non-last children only", () => {
    const tree = buildJsonTree([10, 20, 30]);
    const rows = flattenTree(tree, new Set([tree.id]));
    // [ , 10, , 20, , 30 , ]
    expect(rows[1].hasComma).toBe(true);
    expect(rows[2].hasComma).toBe(true);
    expect(rows[3].hasComma).toBe(false); // last item
  });

  it("puts the comma on a non-last container's close row", () => {
    const tree = buildJsonTree([{ a: 1 }, { b: 2 }]);
    const expanded = new Set([
      tree.id,
      tree.children![0].id,
      tree.children![1].id,
    ]);
    const rows = flattenTree(tree, expanded);
    const firstClose = rows.find(
      (r) => r.kind === "close" && r.nodeId === tree.children![0].id,
    )!;
    expect(firstClose.hasComma).toBe(true);
  });
});

// ── windowing of large expanded containers ──

describe("flattenTree windowing", () => {
  // An array one past the window: forces a single show-more row when expanded.
  const overWindow = () =>
    buildJsonTree(Array.from({ length: CONTAINER_WINDOW + 5 }, (_, i) => i));

  it("does not window a container at or below the window size", () => {
    const tree = buildJsonTree(
      Array.from({ length: CONTAINER_WINDOW }, (_, i) => i),
    );
    const rows = flattenTree(tree, new Set([tree.id]));
    expect(rows.some((r) => r.kind === "show-more")).toBe(false);
    // open + CONTAINER_WINDOW leaves + close
    expect(rows).toHaveLength(CONTAINER_WINDOW + 2);
  });

  it("reveals only the first window and appends a show-more row", () => {
    const tree = overWindow();
    const rows = flattenTree(tree, new Set([tree.id]));
    const leaves = rows.filter((r) => r.kind === "leaf");
    expect(leaves).toHaveLength(CONTAINER_WINDOW);

    const more = rows.find((r) => r.kind === "show-more")!;
    expect(more).toMatchObject({
      kind: "show-more",
      nodeId: tree.id,
      containerType: "array",
      childCount: CONTAINER_WINDOW + 5,
      shownCount: CONTAINER_WINDOW,
      depth: 1, // indented as a child of the root container
    });
    // The show-more row sits just before the container's close row.
    const moreIdx = rows.indexOf(more);
    expect(rows[moreIdx + 1].kind).toBe("close");
  });

  it("keeps a trailing comma on the last revealed child (more follow)", () => {
    const tree = overWindow();
    const rows = flattenTree(tree, new Set([tree.id]));
    const leaves = rows.filter((r) => r.kind === "leaf");
    expect(leaves[leaves.length - 1].hasComma).toBe(true);
  });

  it("honours a raised reveal limit and drops show-more once all are shown", () => {
    const tree = overWindow();
    const total = CONTAINER_WINDOW + 5;

    const partial = flattenTree(
      tree,
      new Set([tree.id]),
      new Map([[tree.id, CONTAINER_WINDOW + 2]]),
    );
    expect(partial.filter((r) => r.kind === "leaf")).toHaveLength(
      CONTAINER_WINDOW + 2,
    );
    expect(partial.some((r) => r.kind === "show-more")).toBe(true);

    const full = flattenTree(
      tree,
      new Set([tree.id]),
      new Map([[tree.id, total]]),
    );
    expect(full.filter((r) => r.kind === "leaf")).toHaveLength(total);
    expect(full.some((r) => r.kind === "show-more")).toBe(false);
  });
});

// ── truncated surfaced onto rows ──

describe("flattenTree truncated flag", () => {
  it("surfaces a node's truncated flag onto its row (phase 3 accommodation)", () => {
    const tree = buildJsonTree({ big: "value" });
    // Mark the leaf truncated as a later phase would, and confirm flatten
    // carries it through without reworking the model.
    const leaf = tree.children![0] as JsonTreeNode;
    leaf.truncated = true;
    const rows = flattenTree(tree, new Set([tree.id]));
    const leafRow = rows.find((r) => r.kind === "leaf")!;
    expect(leafRow.truncated).toBe(true);
  });
});

// ── formatPrimitive ──

describe("formatPrimitive", () => {
  it("maps each JSON value type to its text and class", () => {
    expect(formatPrimitive(null)).toEqual({
      text: "null",
      cls: "text-json-null",
    });
    expect(formatPrimitive(true)).toEqual({
      text: "true",
      cls: "text-json-boolean",
    });
    expect(formatPrimitive(-3.14)).toEqual({
      text: "-3.14",
      cls: "text-json-number",
    });
    expect(formatPrimitive("hi")).toEqual({
      text: '"hi"',
      cls: "text-json-string",
    });
  });

  it("JSON-escapes strings", () => {
    expect(formatPrimitive('a"b\nc').text).toBe('"a\\"b\\nc"');
  });
});

// ── flattenForest (NDJSON multi-document, PRO-400) ──

describe("flattenForest", () => {
  it("tags only the first row of each document with its docIndex", () => {
    const roots = buildJsonForest([{ a: 1 }, { b: 2 }]);
    // Both document roots expanded so each contributes open/leaf/close rows.
    const expanded = new Set(roots.map((r) => r.id));
    const rows = flattenForest(roots, expanded);

    const tagged = rows
      .map((r, i) => ({ i, docIndex: r.docIndex }))
      .filter((r) => r.docIndex !== undefined);
    // Exactly two tagged rows (one per document), at the document boundaries.
    expect(tagged.map((t) => t.docIndex)).toEqual([0, 1]);
    expect(tagged[0].i).toBe(0);
    // The first document's rows (open, leaf, close) precede the second's first row.
    expect(rows[tagged[1].i].kind).toBe("open");
  });

  it("collapses each document independently", () => {
    const roots = buildJsonForest([{ a: 1 }, { b: 2 }]);
    // Only the second document expanded; the first is a single collapsed row.
    const rows = flattenForest(roots, new Set([roots[1].id]));

    const doc0 = rows.find((r) => r.docIndex === 0)!;
    expect(doc0.kind).toBe("collapsed");
    expect(doc0.childCount).toBe(1);

    const doc1 = rows.find((r) => r.docIndex === 1)!;
    expect(doc1.kind).toBe("open");
  });

  it("never trails a document's root with a comma", () => {
    const roots = buildJsonForest([{ a: 1 }, { b: 2 }]);
    const rows = flattenForest(roots, new Set(roots.map((r) => r.id)));
    for (const r of rows) {
      if (r.docIndex !== undefined) expect(r.hasComma).toBe(false);
    }
  });

  it("returns no rows for an empty forest", () => {
    expect(flattenForest([], new Set())).toEqual([]);
  });
});
