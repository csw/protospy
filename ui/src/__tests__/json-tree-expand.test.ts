import { describe, it, expect } from "vitest";
import {
  buildJsonTree,
  type JsonTreeNode,
  type JsonValue,
} from "@ui/components/json-tree/model";
import {
  computeDefaultExpanded,
  computeForestDefaultExpanded,
  DEFAULT_EXPAND_DEPTH,
  FOREST_EXPAND_BUDGET,
  LARGE_CONTAINER_CHILD_COUNT,
  SMALL_TREE_NODE_COUNT,
} from "@ui/components/json-tree/expand";
import { buildJsonForest } from "@ui/components/json-tree/model";

// ── Synthetic, controlled-depth builders (depth behavior is validated against
//    these, not a realistic ES fixture — its depths aren't a contract) ──

/** A chain of `depth` nested single-key objects ending in a leaf. */
function deepChain(depth: number): JsonValue {
  let v: JsonValue = "leaf";
  for (let i = 0; i < depth; i++) v = { child: v };
  return v;
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Walk the single-key object chain rooted at `node`, returning each container. */
function chainContainers(node: JsonTreeNode): JsonTreeNode[] {
  const out: JsonTreeNode[] = [];
  let cur: JsonTreeNode | undefined = node;
  while (cur && cur.type === "object" && (cur.children?.length ?? 0) > 0) {
    out.push(cur);
    cur = cur.children![0];
  }
  return out;
}

// ── Small-tree escape hatch ──

describe("computeDefaultExpanded small trees", () => {
  it("fully expands a small tree even past the depth threshold", () => {
    // 7 containers deep, but only ~9 nodes total → under SMALL_TREE_NODE_COUNT.
    const value = deepChain(7);
    const tree = buildJsonTree(value);
    expect(tree).toBeDefined();
    const expanded = computeDefaultExpanded(tree);
    // Every non-empty container (including those deeper than DEFAULT_EXPAND_DEPTH)
    // is expanded.
    for (const c of chainContainers(tree)) {
      expect(expanded.has(c.id)).toBe(true);
    }
  });

  it("does not expand empty containers", () => {
    const tree = buildJsonTree({ a: {}, b: [] });
    const expanded = computeDefaultExpanded(tree);
    expect(expanded.has(tree.children![0].id)).toBe(false);
    expect(expanded.has(tree.children![1].id)).toBe(false);
  });
});

// ── Depth threshold (large tree, escape hatch off) ──

describe("computeDefaultExpanded depth threshold", () => {
  it("expands containers within the depth threshold and collapses deeper ones", () => {
    // Pad past SMALL_TREE_NODE_COUNT so the depth rule (not the escape) applies.
    const tree = buildJsonTree({
      chain: deepChain(7),
      pad: range(SMALL_TREE_NODE_COUNT + 10),
    });
    const expanded = computeDefaultExpanded(tree);

    const chain = tree.children!.find((c) => c.key === "chain")!;
    const containers = chainContainers(chain); // depths 1..7
    for (const c of containers) {
      const shouldExpand = c.depth <= DEFAULT_EXPAND_DEPTH;
      expect(expanded.has(c.id)).toBe(shouldExpand);
    }
    // sanity: the boundary actually straddles the threshold
    expect(containers.some((c) => c.depth === DEFAULT_EXPAND_DEPTH)).toBe(true);
    expect(containers.some((c) => c.depth === DEFAULT_EXPAND_DEPTH + 1)).toBe(
      true,
    );
  });

  it("respects a custom maxDepth", () => {
    const tree = buildJsonTree({
      chain: deepChain(7),
      pad: range(SMALL_TREE_NODE_COUNT + 10),
    });
    const expanded = computeDefaultExpanded(tree, { maxDepth: 2 });
    const containers = chainContainers(
      tree.children!.find((c) => c.key === "chain")!,
    );
    for (const c of containers) {
      expect(expanded.has(c.id)).toBe(c.depth <= 2);
    }
  });
});

// ── Per-container child-count cap ──

describe("computeDefaultExpanded child-count cap", () => {
  it("collapses a container with more than the child cap, regardless of depth", () => {
    const tree = buildJsonTree({
      big: range(LARGE_CONTAINER_CHILD_COUNT + 1).map((i) => ({ i })),
    });
    const expanded = computeDefaultExpanded(tree);
    const big = tree.children![0];
    expect(big.depth).toBe(1); // shallow
    expect(big.childCount).toBe(LARGE_CONTAINER_CHILD_COUNT + 1);
    expect(expanded.has(tree.id)).toBe(true); // root still expands
    expect(expanded.has(big.id)).toBe(false); // wide container collapses
  });

  it("expands a container at exactly the child cap", () => {
    const tree = buildJsonTree({
      atCap: range(LARGE_CONTAINER_CHILD_COUNT).map((i) => ({ i })),
    });
    const expanded = computeDefaultExpanded(tree);
    const atCap = tree.children![0];
    expect(atCap.childCount).toBe(LARGE_CONTAINER_CHILD_COUNT);
    expect(expanded.has(atCap.id)).toBe(true);
  });
});

// ── computeForestDefaultExpanded (NDJSON, PRO-400) ──

describe("computeForestDefaultExpanded", () => {
  it("expands small documents within the byte budget", () => {
    const docs = [{ a: { b: 1 } }, { c: 2 }];
    const roots = buildJsonForest(docs);
    const sizes = docs.map((d) => JSON.stringify(d).length);
    const expanded = computeForestDefaultExpanded(roots, {}, sizes);
    for (const root of roots) {
      expect(expanded.has(root.id)).toBe(true);
    }
  });

  it("collapses documents that exceed the budget", () => {
    const small = { a: 1 };
    const large = Object.fromEntries(
      Array.from({ length: 2000 }, (_, i) => [
        `key_${i}`,
        `value-padding-${i}`,
      ]),
    );
    const docs = [small, large];
    const roots = buildJsonForest(docs);
    const sizes = docs.map((d) => JSON.stringify(d).length);
    expect(sizes[1]).toBeGreaterThan(FOREST_EXPAND_BUDGET);
    const expanded = computeForestDefaultExpanded(roots, {}, sizes);
    expect(expanded.has(roots[0].id)).toBe(true);
    expect(expanded.has(roots[1].id)).toBe(false);
  });

  it("collapses all roots when no sizes are provided (legacy)", () => {
    const roots = buildJsonForest([{ a: { b: 1 } }, { c: 2 }]);
    const expanded = computeForestDefaultExpanded(roots);
    for (const root of roots) {
      expect(expanded.has(root.id)).toBe(false);
    }
  });

  it("still precomputes each document's inner expansion", () => {
    const docs = [{ a: { b: 1 } }];
    const roots = buildJsonForest(docs);
    const inner = roots[0].children![0]; // the `a` container
    const sizes = docs.map((d) => JSON.stringify(d).length);
    const expanded = computeForestDefaultExpanded(roots, {}, sizes);
    expect(expanded.has(inner.id)).toBe(true);
  });

  it("returns an empty set for an empty forest", () => {
    expect(computeForestDefaultExpanded([]).size).toBe(0);
  });
});
