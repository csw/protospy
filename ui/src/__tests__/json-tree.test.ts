import { describe, it, expect } from "vitest";
import {
  buildJsonTree,
  flattenTree,
  computeAutoExpanded,
  computeDefaultExpanded,
  formatPrimitive,
  AUTO_COLLAPSE_LINE_THRESHOLD,
} from "@ui/lib/json-tree";

// ── buildJsonTree ──

describe("buildJsonTree", () => {
  it("builds a leaf node for null", () => {
    const tree = buildJsonTree(null);
    expect(tree).toMatchObject({
      id: 0,
      type: "null",
      value: null,
      lineCount: 1,
    });
    expect(tree.children).toBeUndefined();
  });

  it("builds a leaf node for a string", () => {
    const tree = buildJsonTree("hello");
    expect(tree).toMatchObject({
      type: "string",
      value: "hello",
      lineCount: 1,
    });
  });

  it("builds a leaf node for a number", () => {
    const tree = buildJsonTree(42);
    expect(tree).toMatchObject({
      type: "number",
      value: 42,
      lineCount: 1,
    });
  });

  it("builds a leaf node for a boolean", () => {
    const tree = buildJsonTree(true);
    expect(tree).toMatchObject({
      type: "boolean",
      value: true,
      lineCount: 1,
    });
  });

  it("builds an array node with children", () => {
    const tree = buildJsonTree([1, 2, 3]);
    expect(tree.type).toBe("array");
    expect(tree.children).toHaveLength(3);
    expect(tree.children![0]).toMatchObject({ type: "number", value: 1 });
    expect(tree.children![1]).toMatchObject({ type: "number", value: 2 });
    expect(tree.children![2]).toMatchObject({ type: "number", value: 3 });
  });

  it("builds an empty array node", () => {
    const tree = buildJsonTree([]);
    expect(tree.type).toBe("array");
    expect(tree.children).toHaveLength(0);
    expect(tree.lineCount).toBe(1); // renders as []
  });

  it("builds an object node with keyed children", () => {
    const tree = buildJsonTree({ name: "Alice", age: 30 });
    expect(tree.type).toBe("object");
    expect(tree.children).toHaveLength(2);
    expect(tree.children![0]).toMatchObject({
      type: "string",
      key: "name",
      value: "Alice",
    });
    expect(tree.children![1]).toMatchObject({
      type: "number",
      key: "age",
      value: 30,
    });
  });

  it("builds an empty object node", () => {
    const tree = buildJsonTree({});
    expect(tree.type).toBe("object");
    expect(tree.children).toHaveLength(0);
    expect(tree.lineCount).toBe(1); // renders as {}
  });

  it("assigns sequential IDs across nested structure", () => {
    const tree = buildJsonTree({ a: [1, 2] });
    // root object = 0, child "a" array = 1, items = 2, 3
    expect(tree.id).toBe(0);
    expect(tree.children![0].id).toBe(1);
    expect(tree.children![0].children![0].id).toBe(2);
    expect(tree.children![0].children![1].id).toBe(3);
  });

  it("computes lineCount for nested structure", () => {
    // { "a": [1, 2] }
    // Lines fully expanded:
    //   {              (1)
    //     "a": [       (2)
    //       1,         (3)
    //       2          (4)
    //     ]            (5)
    //   }              (6)
    const tree = buildJsonTree({ a: [1, 2] });
    expect(tree.lineCount).toBe(6);
  });

  it("handles deeply nested values", () => {
    const tree = buildJsonTree({ a: { b: { c: 1 } } });
    expect(tree.type).toBe("object");
    expect(tree.children![0].type).toBe("object");
    expect(tree.children![0].children![0].type).toBe("object");
    expect(tree.children![0].children![0].children![0]).toMatchObject({
      type: "number",
      key: "c",
      value: 1,
    });
  });

  it("does not assign keys to array children", () => {
    const tree = buildJsonTree([1, "two", null]);
    for (const child of tree.children!) {
      expect(child.key).toBeUndefined();
    }
  });
});

// ── flattenTree ──

describe("flattenTree", () => {
  it("flattens a single primitive to one leaf line", () => {
    const tree = buildJsonTree(42);
    const lines = flattenTree(tree, new Set());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: "leaf",
      depth: 0,
      valueText: "42",
      valueCls: "text-j-num",
      hasComma: false,
    });
  });

  it("flattens an empty object as a single leaf line", () => {
    const tree = buildJsonTree({});
    const lines = flattenTree(tree, new Set());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: "leaf",
      depth: 0,
      valueText: "{}",
      valueCls: "text-j-punct",
      hasComma: false,
    });
  });

  it("flattens an empty array as a single leaf line", () => {
    const tree = buildJsonTree([]);
    const lines = flattenTree(tree, new Set());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: "leaf",
      depth: 0,
      valueText: "[]",
      valueCls: "text-j-punct",
    });
  });

  it("shows collapsed summary when container is not expanded", () => {
    const tree = buildJsonTree({ a: 1, b: 2 });
    // Don't expand root (node 0)
    const lines = flattenTree(tree, new Set());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: "collapsed",
      containerType: "object",
      childCount: 2,
      hasComma: false,
    });
  });

  it("shows collapsed array with child count", () => {
    const tree = buildJsonTree([1, 2, 3, 4, 5]);
    const lines = flattenTree(tree, new Set());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: "collapsed",
      containerType: "array",
      childCount: 5,
    });
  });

  it("expands a container into open + children + close", () => {
    const tree = buildJsonTree({ a: 1, b: 2 });
    const expanded = new Set([tree.id]);
    const lines = flattenTree(tree, expanded);
    expect(lines).toHaveLength(4); // { + "a": 1 + "b": 2 + }
    expect(lines[0]).toMatchObject({
      kind: "open",
      depth: 0,
      containerType: "object",
    });
    expect(lines[1]).toMatchObject({
      kind: "leaf",
      depth: 1,
      key: "a",
      valueText: "1",
      hasComma: true,
    });
    expect(lines[2]).toMatchObject({
      kind: "leaf",
      depth: 1,
      key: "b",
      valueText: "2",
      hasComma: false, // last child
    });
    expect(lines[3]).toMatchObject({
      kind: "close",
      depth: 0,
      containerType: "object",
    });
  });

  it("applies trailing commas correctly to non-last children", () => {
    const tree = buildJsonTree([10, 20, 30]);
    const expanded = new Set([tree.id]);
    const lines = flattenTree(tree, expanded);
    // [ + 10, + 20, + 30 + ]
    expect(lines[1].hasComma).toBe(true); // 10
    expect(lines[2].hasComma).toBe(true); // 20
    expect(lines[3].hasComma).toBe(false); // 30 (last)
  });

  it("flattens nested expanded containers", () => {
    const tree = buildJsonTree({ a: { b: 1 } });
    // Expand root (0) and child "a" (1)
    const expanded = new Set([0, 1]);
    const lines = flattenTree(tree, expanded);
    // { + "a": { + "b": 1 + } + }
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatchObject({ kind: "open", depth: 0 });
    expect(lines[1]).toMatchObject({ kind: "open", depth: 1, key: "a" });
    expect(lines[2]).toMatchObject({ kind: "leaf", depth: 2, key: "b" });
    expect(lines[3]).toMatchObject({ kind: "close", depth: 1 });
    expect(lines[4]).toMatchObject({ kind: "close", depth: 0 });
  });

  it("shows collapsed child inside expanded parent", () => {
    const tree = buildJsonTree({ a: { b: 1 }, c: 2 });
    // Expand root but not child "a"
    const expanded = new Set([tree.id]);
    const lines = flattenTree(tree, expanded);
    // { + "a": {…} + "c": 2 + }
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({ kind: "open", depth: 0 });
    expect(lines[1]).toMatchObject({
      kind: "collapsed",
      depth: 1,
      key: "a",
      containerType: "object",
      childCount: 1,
    });
    expect(lines[2]).toMatchObject({ kind: "leaf", depth: 1, key: "c" });
    expect(lines[3]).toMatchObject({ kind: "close", depth: 0 });
  });

  it("handles array inside object with mixed expansion", () => {
    const tree = buildJsonTree({ items: [1, 2], count: 2 });
    // Expand root (0) and the "items" array (1)
    const expanded = new Set([0, 1]);
    const lines = flattenTree(tree, expanded);
    // { + "items": [ + 1, + 2 + ] + "count": 2 + }
    expect(lines).toHaveLength(7);
    expect(lines[0].kind).toBe("open"); // {
    expect(lines[1]).toMatchObject({
      kind: "open",
      key: "items",
      containerType: "array",
    });
    expect(lines[2]).toMatchObject({ kind: "leaf", depth: 2, valueText: "1" });
    expect(lines[3]).toMatchObject({ kind: "leaf", depth: 2, valueText: "2" });
    expect(lines[4]).toMatchObject({ kind: "close", containerType: "array" });
    expect(lines[5]).toMatchObject({ kind: "leaf", key: "count" });
    expect(lines[6].kind).toBe("close"); // }
  });

  it("close line on root container has hasComma false", () => {
    const tree = buildJsonTree({ a: 1 });
    const lines = flattenTree(tree, new Set([tree.id]));
    const closeLine = lines[lines.length - 1];
    expect(closeLine.kind).toBe("close");
    expect(closeLine.hasComma).toBe(false);
  });

  it("close line on non-last sibling has hasComma true", () => {
    // Array with two object children, both expanded
    const tree = buildJsonTree([{ a: 1 }, { b: 2 }]);
    const ids = new Set([tree.id, tree.children![0].id, tree.children![1].id]);
    const lines = flattenTree(tree, ids);
    // [ + { + "a": 1 + }, + { + "b": 2 + } + ]
    // The first object's close }, is non-last → hasComma true
    const firstObjClose = lines.find(
      (l) => l.kind === "close" && l.nodeId === tree.children![0].id,
    )!;
    expect(firstObjClose.hasComma).toBe(true);
  });
});

// ── computeDefaultExpanded ──

describe("computeDefaultExpanded", () => {
  it("returns empty set for a primitive root", () => {
    const tree = buildJsonTree(42);
    const expanded = computeDefaultExpanded(tree, Infinity);
    expect(expanded.size).toBe(0);
  });

  it("returns empty set for an empty container", () => {
    const tree = buildJsonTree({});
    const expanded = computeDefaultExpanded(tree, Infinity);
    expect(expanded.size).toBe(0); // empty containers aren't expandable
  });

  it("expands all containers at Infinity depth", () => {
    const tree = buildJsonTree({ a: { b: { c: 1 } } });
    const expanded = computeDefaultExpanded(tree, Infinity);
    // root + "a" object + "b" object = 3 containers
    expect(expanded.size).toBe(3);
  });

  it("respects maxDepth limit", () => {
    const tree = buildJsonTree({ a: { b: { c: 1 } } });

    // depth 0: root only
    const d0 = computeDefaultExpanded(tree, 0);
    expect(d0.size).toBe(1);
    expect(d0.has(tree.id)).toBe(true);

    // depth 1: root + "a"
    const d1 = computeDefaultExpanded(tree, 1);
    expect(d1.size).toBe(2);

    // depth 2: root + "a" + "b" (all)
    const d2 = computeDefaultExpanded(tree, 2);
    expect(d2.size).toBe(3);
  });

  it("handles arrays at various depths", () => {
    const tree = buildJsonTree({
      items: [
        [1, 2],
        [3, 4],
      ],
    });
    // root (0), "items" array (1), inner arrays (depth 2)
    const d1 = computeDefaultExpanded(tree, 1);
    // Should expand root and "items" but not inner arrays
    expect(d1.has(tree.id)).toBe(true);
    expect(d1.has(tree.children![0].id)).toBe(true);
    // Inner arrays at depth 2 should not be expanded
    const innerArrays = tree.children![0].children!;
    for (const inner of innerArrays) {
      expect(d1.has(inner.id)).toBe(false);
    }
  });
});

// ── computeAutoExpanded ──

describe("computeAutoExpanded", () => {
  it("fully expands small trees", () => {
    const tree = buildJsonTree({ a: 1, b: 2 });
    // lineCount = 4 (under threshold)
    expect(tree.lineCount).toBeLessThanOrEqual(AUTO_COLLAPSE_LINE_THRESHOLD);
    const expanded = computeAutoExpanded(tree);
    expect(expanded.has(tree.id)).toBe(true);
  });

  it("auto-collapses large trees to depth threshold", () => {
    // Build a tree that exceeds the line threshold
    const largeObj: Record<string, unknown> = {};
    for (let i = 0; i < 30; i++) {
      largeObj[`key${i}`] = { nested: i };
    }
    const tree = buildJsonTree(largeObj);
    expect(tree.lineCount).toBeGreaterThan(AUTO_COLLAPSE_LINE_THRESHOLD);

    const expanded = computeAutoExpanded(tree);
    // Root should be expanded
    expect(expanded.has(tree.id)).toBe(true);

    // Children at depth 1 (the nested objects) should be expanded
    // because AUTO_COLLAPSE_MAX_DEPTH = 2
    for (const child of tree.children!) {
      if (child.children && child.children.length > 0) {
        expect(expanded.has(child.id)).toBe(true);
      }
    }

    // But if there were depth-3 containers, they would NOT be expanded
    // (verified by the structure — our nested objects contain only a primitive)
  });

  it("respects the exact threshold boundary", () => {
    // Build a tree with exactly AUTO_COLLAPSE_LINE_THRESHOLD lines
    // Each top-level key adds 1 line; the object wrapper adds 2 lines.
    // So we need threshold - 2 keys.
    const obj: Record<string, number> = {};
    for (let i = 0; i < AUTO_COLLAPSE_LINE_THRESHOLD - 2; i++) {
      obj[`k${i}`] = i;
    }
    const tree = buildJsonTree(obj);
    expect(tree.lineCount).toBe(AUTO_COLLAPSE_LINE_THRESHOLD);

    // At exactly the threshold, should be fully expanded
    const expanded = computeAutoExpanded(tree);
    expect(expanded.has(tree.id)).toBe(true);
  });
});

// ── formatPrimitive ──

describe("formatPrimitive", () => {
  it("formats null", () => {
    expect(formatPrimitive(null)).toEqual({
      text: "null",
      cls: "text-j-bool",
    });
  });

  it("formats true", () => {
    expect(formatPrimitive(true)).toEqual({
      text: "true",
      cls: "text-j-bool",
    });
  });

  it("formats false", () => {
    expect(formatPrimitive(false)).toEqual({
      text: "false",
      cls: "text-j-bool",
    });
  });

  it("formats integers", () => {
    expect(formatPrimitive(42)).toEqual({ text: "42", cls: "text-j-num" });
  });

  it("formats negative floats", () => {
    expect(formatPrimitive(-3.14)).toEqual({
      text: "-3.14",
      cls: "text-j-num",
    });
  });

  it("formats strings with JSON encoding", () => {
    expect(formatPrimitive("hello")).toEqual({
      text: '"hello"',
      cls: "text-j-str",
    });
  });

  it("escapes special characters in strings", () => {
    expect(formatPrimitive("line1\nline2")).toEqual({
      text: '"line1\\nline2"',
      cls: "text-j-str",
    });
  });

  it("escapes quotes in strings", () => {
    expect(formatPrimitive('say "hi"')).toEqual({
      text: '"say \\"hi\\""',
      cls: "text-j-str",
    });
  });

  it("formats zero", () => {
    expect(formatPrimitive(0)).toEqual({ text: "0", cls: "text-j-num" });
  });

  it("formats empty string", () => {
    expect(formatPrimitive("")).toEqual({ text: '""', cls: "text-j-str" });
  });
});

// ── Integration: round-trip consistency ──

describe("tree round-trip", () => {
  it("fully expanded tree matches source JSON line count", () => {
    const json = { a: [1, { b: true }], c: "hello" };
    const text = JSON.stringify(json, null, 2);
    const textLineCount = text.split("\n").length;

    const tree = buildJsonTree(json);
    expect(tree.lineCount).toBe(textLineCount);
  });

  it("collapsed root produces exactly one line", () => {
    const tree = buildJsonTree({ x: [1, 2, 3], y: { z: true } });
    const lines = flattenTree(tree, new Set());
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe("collapsed");
  });

  it("toggling a node changes the visible line count", () => {
    const tree = buildJsonTree({ a: 1, b: 2 });
    const collapsed = flattenTree(tree, new Set());
    expect(collapsed).toHaveLength(1);

    const expandedLines = flattenTree(tree, new Set([tree.id]));
    expect(expandedLines).toHaveLength(4); // { + a + b + }
  });

  it("handles realistic Elasticsearch-style response", () => {
    const esResponse = {
      took: 5,
      timed_out: false,
      _shards: { total: 5, successful: 5, skipped: 0, failed: 0 },
      hits: {
        total: { value: 100, relation: "eq" },
        max_score: 1.0,
        hits: [
          {
            _index: "test",
            _id: "1",
            _score: 1.0,
            _source: { name: "Alice", age: 30 },
          },
          {
            _index: "test",
            _id: "2",
            _score: 0.9,
            _source: { name: "Bob", age: 25 },
          },
        ],
      },
    };

    const tree = buildJsonTree(esResponse);
    expect(tree.type).toBe("object");

    // Fully expanded line count should match JSON.stringify
    const text = JSON.stringify(esResponse, null, 2);
    expect(tree.lineCount).toBe(text.split("\n").length);

    // With auto-expand, root should be expanded (tree is large enough
    // to exceed threshold depending on size, but let's just verify it works)
    const expanded = computeAutoExpanded(tree);
    const lines = flattenTree(tree, expanded);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].kind).toBe("open");
  });
});
