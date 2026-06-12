import { describe, it, expect } from "vitest";
import {
  buildJsonTree,
  type JsonTreeNode,
} from "@ui/components/json-tree/model";
import { flattenTree, formatPrimitive } from "@ui/components/json-tree/flatten";

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
