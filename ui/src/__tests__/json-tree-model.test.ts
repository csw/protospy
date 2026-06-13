import { describe, it, expect } from "vitest";
import {
  buildJsonTree,
  formatPath,
  countNodes,
  type JsonTreeNode,
} from "@ui/components/json-tree/model";

// ── buildJsonTree: leaves ──

describe("buildJsonTree leaves", () => {
  it("builds a null leaf", () => {
    expect(buildJsonTree(null)).toMatchObject({
      id: 0,
      type: "null",
      value: null,
      depth: 0,
      childCount: 0,
      truncated: false,
    });
  });

  it("builds string, number, boolean leaves with childCount 0", () => {
    expect(buildJsonTree("hi")).toMatchObject({ type: "string", value: "hi" });
    expect(buildJsonTree(42)).toMatchObject({ type: "number", value: 42 });
    expect(buildJsonTree(true)).toMatchObject({ type: "boolean", value: true });
    for (const v of ["hi", 42, true]) {
      expect(buildJsonTree(v).childCount).toBe(0);
      expect(buildJsonTree(v).children).toBeUndefined();
    }
  });

  it("defaults truncated to false on every node", () => {
    const tree = buildJsonTree({ a: [1, { b: 2 }] });
    const seen: boolean[] = [];
    const walk = (n: JsonTreeNode) => {
      seen.push(n.truncated);
      for (const c of n.children ?? []) walk(c);
    };
    walk(tree);
    expect(seen.every((t) => t === false)).toBe(true);
  });
});

// ── buildJsonTree: containers, depth, childCount ──

describe("buildJsonTree containers", () => {
  it("builds an array with indexed children and childCount", () => {
    const tree = buildJsonTree([1, 2, 3]);
    expect(tree.type).toBe("array");
    expect(tree.childCount).toBe(3);
    expect(tree.children).toHaveLength(3);
    for (const child of tree.children!) {
      // Array items carry no key
      expect(child.key).toBeUndefined();
      expect(child.depth).toBe(1);
    }
  });

  it("builds an object with keyed children and childCount", () => {
    const tree = buildJsonTree({ name: "Alice", age: 30 });
    expect(tree.type).toBe("object");
    expect(tree.childCount).toBe(2);
    expect(tree.children![0]).toMatchObject({ key: "name", value: "Alice" });
    expect(tree.children![1]).toMatchObject({ key: "age", value: 30 });
  });

  it("reports childCount 0 for empty containers", () => {
    expect(buildJsonTree({}).childCount).toBe(0);
    expect(buildJsonTree([]).childCount).toBe(0);
    expect(buildJsonTree([]).children).toHaveLength(0);
  });

  it("assigns increasing depth with nesting", () => {
    const tree = buildJsonTree({ a: { b: { c: 1 } } });
    const a = tree.children![0];
    const b = a.children![0];
    const c = b.children![0];
    expect([tree.depth, a.depth, b.depth, c.depth]).toEqual([0, 1, 2, 3]);
  });

  it("assigns sequential ids depth-first", () => {
    const tree = buildJsonTree({ a: [1, 2] });
    expect(tree.id).toBe(0);
    expect(tree.children![0].id).toBe(1); // "a" array
    expect(tree.children![0].children![0].id).toBe(2); // 1
    expect(tree.children![0].children![1].id).toBe(3); // 2
  });

  it("handles a large array", () => {
    const tree = buildJsonTree(Array.from({ length: 500 }, (_, i) => i));
    expect(tree.childCount).toBe(500);
    expect(tree.children![499]).toMatchObject({ value: 499, depth: 1 });
  });
});

// ── path indexing ──

describe("node paths", () => {
  it("gives the root an empty path", () => {
    expect(buildJsonTree({ a: 1 }).path).toEqual([]);
  });

  it("records object keys and array indices along the path", () => {
    const tree = buildJsonTree({
      hits: { hits: [{ _source: { user: "x" } }] },
    });
    const hits = tree.children![0];
    const hitsArr = hits.children![0];
    const hit0 = hitsArr.children![0];
    const source = hit0.children![0];
    const user = source.children![0];
    expect(hits.path).toEqual(["hits"]);
    expect(hitsArr.path).toEqual(["hits", "hits"]);
    expect(hit0.path).toEqual(["hits", "hits", 0]);
    expect(source.path).toEqual(["hits", "hits", 0, "_source"]);
    expect(user.path).toEqual(["hits", "hits", 0, "_source", "user"]);
  });

  it("tracks deep paths through mixed nesting", () => {
    const tree = buildJsonTree([{ a: [{ b: 1 }] }]);
    // [0].a[0].b
    const b = tree.children![0].children![0].children![0].children![0];
    expect(b.path).toEqual([0, "a", 0, "b"]);
    expect(b.depth).toBe(4);
  });
});

describe("formatPath", () => {
  it("formats the root as $", () => {
    expect(formatPath([])).toBe("$");
  });

  it("uses dot notation for identifier keys and brackets for indices", () => {
    expect(formatPath(["hits", "hits", 0, "_source", "user"])).toBe(
      "$.hits.hits[0]._source.user",
    );
  });

  it("bracket-quotes non-identifier keys", () => {
    expect(formatPath(["weird key", 2])).toBe('$["weird key"][2]');
  });
});

// ── countNodes ──

describe("countNodes", () => {
  it("counts a single leaf as 1", () => {
    expect(countNodes(buildJsonTree(42))).toBe(1);
  });

  it("counts every node in the subtree", () => {
    // root + "a" array + 2 items = 4
    expect(countNodes(buildJsonTree({ a: [1, 2] }))).toBe(4);
  });

  it("counts empty containers as a single node", () => {
    expect(countNodes(buildJsonTree({}))).toBe(1);
  });
});
