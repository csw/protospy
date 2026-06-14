/**
 * Collapse-by-default heuristics for the JSON tree viewer (phase 1a, PRO-397).
 *
 * The previous viewer auto-collapsed past depth 2, which buries Elasticsearch
 * `hits.hits[]._source` content (the content most users want to see). This
 * module combines a more generous depth threshold with a per-container child
 * cap and a small-tree escape hatch.
 *
 * Pure and free of React/DOM so it is unit-testable in the Vitest `node` project.
 */

import type { JsonTreeNode } from "./model";

/**
 * Containers at or below this depth auto-expand (root = depth 0).
 *
 * Sized so a representative ES search response reveals hit content without
 * manual expansion. Depth trace of an ES response:
 *   response(0) → hits(1) → hits[](2) → hit(3) → _source(4) → fields(5)
 * Expanding through depth 4 expands `_source`, making its fields visible.
 *
 * Starting point — tune against representative bodies during visual review.
 */
export const DEFAULT_EXPAND_DEPTH = 4;

/**
 * Containers with more than this many direct children auto-collapse regardless
 * of depth, keeping the initial flattened row list bounded. ES's default page
 * size is 10 hits (stays expanded); large aggregation/bucket arrays exceed this
 * and stay collapsed. Matches the research report's ~100 recommendation.
 */
export const LARGE_CONTAINER_CHILD_COUNT = 100;

/**
 * Whole-body escape hatch: a tree with at most this many total nodes expands
 * fully regardless of depth (a small body has no performance concern, and
 * collapsing it past the depth threshold would just add friction).
 */
export const SMALL_TREE_NODE_COUNT = 50;

/** Options for {@link computeDefaultExpanded}. */
export interface DefaultExpandOptions {
  /** Max container depth to auto-expand. Default {@link DEFAULT_EXPAND_DEPTH}. */
  maxDepth?: number;
  /**
   * Max direct child count for an auto-expanded container. Default
   * {@link LARGE_CONTAINER_CHILD_COUNT}.
   */
  maxChildren?: number;
  /**
   * Total node count at or below which the whole tree expands fully. Default
   * {@link SMALL_TREE_NODE_COUNT}.
   */
  smallTreeNodeCount?: number;
}

/**
 * Compute the set of node IDs that should be expanded on first render.
 *
 * A non-empty container is auto-expanded iff its depth is within `maxDepth` and
 * its direct child count is within `maxChildren`. Small trees (≤
 * `smallTreeNodeCount` total nodes) expand fully (depth limit lifted; the child
 * cap still applies).
 */
export function computeDefaultExpanded(
  root: JsonTreeNode,
  opts: DefaultExpandOptions = {},
): Set<number> {
  const {
    maxDepth = DEFAULT_EXPAND_DEPTH,
    maxChildren = LARGE_CONTAINER_CHILD_COUNT,
    smallTreeNodeCount = SMALL_TREE_NODE_COUNT,
  } = opts;

  const effectiveMaxDepth =
    root.totalNodes <= smallTreeNodeCount ? Infinity : maxDepth;

  const expanded = new Set<number>();
  collectExpanded(root, effectiveMaxDepth, maxChildren, expanded);
  return expanded;
}

/**
 * Compute the default-expanded set for an NDJSON/JSONL forest (phase 3, PRO-400).
 *
 * Each document's own root starts *collapsed* so the body opens as a scannable
 * list of one-line document summaries (with count badges) that scales to
 * thousands of documents. The inner expansion each document would get on its own
 * (via {@link computeDefaultExpanded}) is still precomputed and included, so
 * expanding a document reveals its tree already drilled to the normal depth
 * rather than fully collapsed.
 */
export function computeForestDefaultExpanded(
  roots: readonly JsonTreeNode[],
  opts: DefaultExpandOptions = {},
): Set<number> {
  const expanded = new Set<number>();
  for (const root of roots) {
    for (const id of computeDefaultExpanded(root, opts)) expanded.add(id);
    // Collapse the document at its own root regardless of the inner heuristic.
    expanded.delete(root.id);
  }
  return expanded;
}

function collectExpanded(
  node: JsonTreeNode,
  maxDepth: number,
  maxChildren: number,
  out: Set<number>,
): void {
  const isContainer = node.type === "object" || node.type === "array";
  if (!isContainer) return;

  const children = node.children ?? [];
  if (children.length === 0) return; // empty containers aren't expandable

  if (node.depth <= maxDepth && node.childCount <= maxChildren) {
    out.add(node.id);
  }
  for (const child of children) {
    collectExpanded(child, maxDepth, maxChildren, out);
  }
}
