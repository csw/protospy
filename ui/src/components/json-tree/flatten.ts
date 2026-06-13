/**
 * Flatten the visible (expanded) JSON tree into a 1-D list of rows for
 * virtualization (phase 1a, PRO-397).
 *
 * Only the *visible* rows are materialized — a container that is collapsed
 * contributes a single `collapsed` row and none of its descendants. Because the
 * viewer is collapse-by-default, this list stays short until the user drills in,
 * so re-flattening on every expand/collapse is O(visible rows). (A cumulative-
 * count index with binary search — see the research report — is the optimization
 * a later phase can add if a fully-expanded multi-MB body ever needs it.)
 *
 * A large expanded container is *windowed*: only the first `CONTAINER_WINDOW`
 * children are materialized, followed by a single `show-more` row. The viewer
 * raises the per-node reveal count through `limits`, so the flattened list (and
 * its allocations) stays bounded even when a huge array is expanded.
 *
 * Pure and free of React/DOM so it is unit-testable in the Vitest `node` project.
 */

import { LARGE_CONTAINER_CHILD_COUNT } from "./expand";
import type { JsonPrimitive, JsonTreeNode, PathSegment } from "./model";

/**
 * How many children of a large container are revealed per step — both the
 * initial window and each "show more" increment. Intentionally the same value
 * as {@link LARGE_CONTAINER_CHILD_COUNT}: a container big enough to auto-collapse
 * is exactly one that windows when expanded, so a single constant governs both.
 */
export const CONTAINER_WINDOW = LARGE_CONTAINER_CHILD_COUNT;

/** The kind of a rendered row. */
export type FlatRowKind = "open" | "close" | "collapsed" | "leaf" | "show-more";

/** A single visible row in the flattened tree output. */
export interface FlatRow {
  /** What kind of row this is. */
  kind: FlatRowKind;
  /** Node ID for expand/collapse targeting. */
  nodeId: number;
  /** Nesting depth (0 = root). */
  depth: number;
  /** Path from the root to this node (for jump-to-path / copy-path, phase 3). */
  path: readonly PathSegment[];
  /** Property key if this node is an object entry. */
  key?: string;
  /** Container type (for open/close/collapsed/show-more rows). */
  containerType?: "object" | "array";
  /** Number of direct children (for container and show-more rows). */
  childCount?: number;
  /** How many children are currently revealed (show-more rows only). */
  shownCount?: number;
  /** Formatted value text (for leaf and empty-container rows). */
  valueText?: string;
  /** CSS class for the value text. */
  valueCls?: string;
  /** Whether a trailing comma should follow the row. */
  hasComma: boolean;
  /** Mirrors the node's `truncated` flag (rendered in phase 3, not 1a). */
  truncated: boolean;
}

/** Shared empty map so the common no-windowing call avoids an allocation. */
const NO_LIMITS: ReadonlyMap<number, number> = new Map();

/**
 * Flatten a tree into visible rows based on which nodes are expanded.
 *
 * `limits` maps a container's node ID to how many of its children to reveal;
 * absent entries fall back to {@link CONTAINER_WINDOW}. A large expanded
 * container shows that many children plus a trailing `show-more` row.
 */
export function flattenTree(
  root: JsonTreeNode,
  expanded: ReadonlySet<number>,
  limits: ReadonlyMap<number, number> = NO_LIMITS,
): FlatRow[] {
  const rows: FlatRow[] = [];
  flattenNode(root, true, expanded, limits, rows);
  return rows;
}

function flattenNode(
  node: JsonTreeNode,
  isLast: boolean,
  expanded: ReadonlySet<number>,
  limits: ReadonlyMap<number, number>,
  out: FlatRow[],
): void {
  const hasComma = !isLast;
  const isContainer = node.type === "object" || node.type === "array";

  if (!isContainer) {
    // Primitive leaf
    const { text, cls } = formatPrimitive(node.value as JsonPrimitive);
    out.push({
      kind: "leaf",
      nodeId: node.id,
      depth: node.depth,
      path: node.path,
      key: node.key,
      valueText: text,
      valueCls: cls,
      hasComma,
      truncated: node.truncated,
    });
    return;
  }

  const children = node.children ?? [];
  const containerType = node.type as "object" | "array";

  // Empty container — render inline as {} or []
  if (children.length === 0) {
    out.push({
      kind: "leaf",
      nodeId: node.id,
      depth: node.depth,
      path: node.path,
      key: node.key,
      valueText: containerType === "object" ? "{}" : "[]",
      valueCls: "text-json-punct",
      hasComma,
      truncated: node.truncated,
    });
    return;
  }

  if (!expanded.has(node.id)) {
    // Collapsed container — single row carrying the child count for the badge
    out.push({
      kind: "collapsed",
      nodeId: node.id,
      depth: node.depth,
      path: node.path,
      key: node.key,
      containerType,
      childCount: node.childCount,
      hasComma,
      truncated: node.truncated,
    });
    return;
  }

  // Expanded container: open + children + close
  out.push({
    kind: "open",
    nodeId: node.id,
    depth: node.depth,
    path: node.path,
    key: node.key,
    containerType,
    childCount: node.childCount,
    hasComma: false, // open bracket never has a trailing comma
    truncated: node.truncated,
  });

  // Window large containers: reveal the first `shown` children, then a
  // show-more row. Small containers (≤ window) always render in full.
  const total = children.length;
  const windowed = total > CONTAINER_WINDOW;
  const shown = windowed
    ? Math.min(limits.get(node.id) ?? CONTAINER_WINDOW, total)
    : total;

  for (let i = 0; i < shown; i++) {
    // A revealed child is "last" only when it is the final child overall; a
    // child followed by hidden siblings still gets a trailing comma.
    flattenNode(children[i], i === total - 1, expanded, limits, out);
  }

  if (shown < total) {
    out.push({
      kind: "show-more",
      nodeId: node.id,
      depth: node.depth + 1, // indented as a child of the container
      path: node.path,
      containerType,
      childCount: total,
      shownCount: shown,
      hasComma: false,
      truncated: false,
    });
  }

  out.push({
    kind: "close",
    nodeId: node.id,
    depth: node.depth,
    path: node.path,
    containerType,
    hasComma,
    truncated: node.truncated,
  });
}

// ── Helpers ──

/** Format a primitive JSON value for display, with its type-based CSS class. */
export function formatPrimitive(value: JsonPrimitive): {
  text: string;
  cls: string;
} {
  if (value === null) return { text: "null", cls: "text-json-null" };
  if (typeof value === "boolean")
    return { text: String(value), cls: "text-json-boolean" };
  if (typeof value === "number")
    return { text: String(value), cls: "text-json-number" };
  // String — JSON.stringify preserves escapes and adds surrounding quotes
  return { text: JSON.stringify(value), cls: "text-json-string" };
}
