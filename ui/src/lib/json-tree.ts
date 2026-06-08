/**
 * Pure functions for building and flattening a collapsible JSON tree.
 *
 * The tree is built from a parsed JSON value and then flattened into a
 * list of visible lines based on which container nodes are expanded.
 * This powers the collapsible tree view in JsonViewer.
 */

// ── Types ──

/** Node types in the JSON tree. */
export type JsonNodeType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null";

/** A node in the parsed JSON tree. */
export interface JsonTreeNode {
  /** Sequential numeric ID, deterministic for a given JSON value. */
  id: number;
  /** Node type. */
  type: JsonNodeType;
  /** Property key if this node is an object entry. */
  key?: string;
  /** Primitive value (only for leaf types: string, number, boolean, null). */
  value?: string | number | boolean | null;
  /** Children (only for container types: object, array). */
  children?: JsonTreeNode[];
  /** Total line count if this node and all descendants were fully expanded. */
  lineCount: number;
}

/** The kind of a rendered flat line. */
export type FlatLineKind = "open" | "close" | "collapsed" | "leaf";

/** A single visible line in the flattened tree output. */
export interface FlatLine {
  /** What kind of line this is. */
  kind: FlatLineKind;
  /** Node ID for expand/collapse targeting. */
  nodeId: number;
  /** Nesting depth (0 = root). */
  depth: number;
  /** Property key if this node is inside an object. */
  key?: string;
  /** Container type (for open/close/collapsed lines). */
  containerType?: "object" | "array";
  /** Number of direct children (for container nodes). */
  childCount?: number;
  /** Formatted value text (for leaf and empty-container lines). */
  valueText?: string;
  /** CSS class for the value text. */
  valueCls?: string;
  /** Whether a trailing comma should follow the line. */
  hasComma: boolean;
}

// ── Constants ──

/** Line-count threshold above which large trees are auto-collapsed. */
export const AUTO_COLLAPSE_LINE_THRESHOLD = 50;

/** Default maximum expand depth when auto-collapsing large trees. */
export const AUTO_COLLAPSE_MAX_DEPTH = 2;

// ── Tree building ──

/** Build a JSON tree from a parsed value. */
export function buildJsonTree(value: unknown): JsonTreeNode {
  const counter = { next: 0 };
  return buildNode(value, undefined, counter);
}

function buildNode(
  value: unknown,
  key: string | undefined,
  counter: { next: number },
): JsonTreeNode {
  const id = counter.next++;

  if (value === null) {
    return { id, type: "null", key, value: null, lineCount: 1 };
  }
  switch (typeof value) {
    case "string":
      return { id, type: "string", key, value, lineCount: 1 };
    case "number":
      return { id, type: "number", key, value, lineCount: 1 };
    case "boolean":
      return { id, type: "boolean", key, value, lineCount: 1 };
  }
  if (Array.isArray(value)) {
    const children = value.map((item) => buildNode(item, undefined, counter));
    const lineCount =
      children.length === 0
        ? 1 // empty array renders as []
        : 2 + children.reduce((sum, c) => sum + c.lineCount, 0);
    return { id, type: "array", key, children, lineCount };
  }
  // Object
  const entries = Object.entries(value as Record<string, unknown>);
  const children = entries.map(([k, v]) => buildNode(v, k, counter));
  const lineCount =
    children.length === 0
      ? 1 // empty object renders as {}
      : 2 + children.reduce((sum, c) => sum + c.lineCount, 0);
  return { id, type: "object", key, children, lineCount };
}

// ── Flattening ──

/** Flatten a tree into visible lines based on which nodes are expanded. */
export function flattenTree(
  root: JsonTreeNode,
  expanded: ReadonlySet<number>,
): FlatLine[] {
  const lines: FlatLine[] = [];
  flattenNode(root, 0, true, expanded, lines);
  return lines;
}

function flattenNode(
  node: JsonTreeNode,
  depth: number,
  isLast: boolean,
  expanded: ReadonlySet<number>,
  out: FlatLine[],
): void {
  const hasComma = !isLast;
  const isContainer = node.type === "object" || node.type === "array";

  if (!isContainer) {
    // Primitive leaf
    const { text, cls } = formatPrimitive(
      node.value as string | number | boolean | null,
    );
    out.push({
      kind: "leaf",
      nodeId: node.id,
      depth,
      key: node.key,
      valueText: text,
      valueCls: cls,
      hasComma,
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
      depth,
      key: node.key,
      valueText: containerType === "object" ? "{}" : "[]",
      valueCls: "text-json-punct",
      hasComma,
    });
    return;
  }

  const isExpanded = expanded.has(node.id);

  if (!isExpanded) {
    // Collapsed container
    out.push({
      kind: "collapsed",
      nodeId: node.id,
      depth,
      key: node.key,
      containerType,
      childCount: children.length,
      hasComma,
    });
    return;
  }

  // Expanded container: open + children + close
  out.push({
    kind: "open",
    nodeId: node.id,
    depth,
    key: node.key,
    containerType,
    childCount: children.length,
    hasComma: false, // open bracket never has trailing comma
  });

  for (let i = 0; i < children.length; i++) {
    flattenNode(
      children[i],
      depth + 1,
      i === children.length - 1,
      expanded,
      out,
    );
  }

  out.push({
    kind: "close",
    nodeId: node.id,
    depth,
    containerType,
    hasComma,
  });
}

// ── Default expand computation ──

/**
 * Compute the default set of expanded node IDs with auto-collapse
 * for large trees. Small trees (<= threshold lines) are fully expanded;
 * large trees are collapsed beyond the default depth.
 */
export function computeAutoExpanded(root: JsonTreeNode): Set<number> {
  if (root.lineCount <= AUTO_COLLAPSE_LINE_THRESHOLD) {
    return computeDefaultExpanded(root, Infinity);
  }
  return computeDefaultExpanded(root, AUTO_COLLAPSE_MAX_DEPTH);
}

/**
 * Collect container node IDs up to (and including) the given depth.
 * Depth 0 is the root; `Infinity` expands everything.
 */
export function computeDefaultExpanded(
  root: JsonTreeNode,
  maxDepth: number,
): Set<number> {
  const expanded = new Set<number>();
  collectExpanded(root, 0, maxDepth, expanded);
  return expanded;
}

function collectExpanded(
  node: JsonTreeNode,
  depth: number,
  maxDepth: number,
  out: Set<number>,
): void {
  const isContainer = node.type === "object" || node.type === "array";
  if (!isContainer) return;
  if ((node.children ?? []).length === 0) return; // empty containers aren't expandable
  if (depth > maxDepth) return;
  out.add(node.id);
  for (const child of node.children ?? []) {
    collectExpanded(child, depth + 1, maxDepth, out);
  }
}

// ── Helpers ──

/**
 * Format a primitive JSON value for display.
 *
 * Known shortcut: `null` is painted with `text-json-boolean` rather than the
 * distinct `text-json-null` slot the design system defines for it. This mirrors
 * the line tokenizer (`tokenizeLine` in JsonViewer), which folds
 * `true | false | null` into a single match and tags them all
 * `text-json-boolean`. Giving `null` its own color — wiring both paths to
 * `text-json-null` — is a deliberate visual change deferred to a follow-up.
 */
export function formatPrimitive(value: string | number | boolean | null): {
  text: string;
  cls: string;
} {
  if (value === null) return { text: "null", cls: "text-json-boolean" };
  if (typeof value === "boolean")
    return { text: String(value), cls: "text-json-boolean" };
  if (typeof value === "number")
    return { text: String(value), cls: "text-json-number" };
  // String — JSON.stringify preserves escapes and adds quotes
  return { text: JSON.stringify(value), cls: "text-json-string" };
}
