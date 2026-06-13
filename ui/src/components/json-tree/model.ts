/**
 * Tree data model for the JSON tree viewer (phase 1a, PRO-397).
 *
 * This is the data structure — `JsonTreeViewer` is the component. The model is
 * built once from a parsed JSON value and then flattened (see `flatten.ts`) into
 * a row list for virtualization. Every node carries its type, depth, path, and
 * direct child count, plus a `truncated` flag the model accommodates now so
 * phase 3 (truncation handling) doesn't have to rework the shape.
 *
 * Kept pure and free of React/DOM/side effects so it is unit-testable in the
 * Vitest `node` project.
 */

// ── JSON value types ──

/** A JSON primitive (leaf value). */
export type JsonPrimitive = string | number | boolean | null;

/** Any JSON value — the input the viewer renders. */
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

// ── Node types ──

/** Node types in the JSON tree. */
export type JsonNodeType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null";

/**
 * A single path segment from the root to a node: an object key (string) or an
 * array index (number). The root's path is the empty array.
 */
export type PathSegment = string | number;

/** A node in the parsed JSON tree. */
export interface JsonTreeNode {
  /** Sequential numeric ID, deterministic for a given JSON value (root = 0). */
  id: number;
  /** Node type. */
  type: JsonNodeType;
  /** Path from the root to this node (empty for the root). */
  path: readonly PathSegment[];
  /** Nesting depth (0 = root). */
  depth: number;
  /** Property key if this node is an object entry (undefined for array items). */
  key?: string;
  /** Primitive value (only for leaf types: string, number, boolean, null). */
  value?: JsonPrimitive;
  /** Children (only for container types: object, array). */
  children?: JsonTreeNode[];
  /** Number of direct children (0 for leaves and empty containers). */
  childCount: number;
  /**
   * Whether this node's value was truncated upstream. Always `false` in phase
   * 1a; phase 3 sets and renders it. Present now so the model and flattener
   * already carry it.
   */
  truncated: boolean;
  /** Total node count in the subtree rooted at this node (including this node). */
  totalNodes: number;
}

// ── Tree building ──

/** Build a JSON tree from a parsed value. */
export function buildJsonTree(value: JsonValue): JsonTreeNode {
  const counter = { next: 0 };
  return buildNode(value, undefined, [], 0, counter);
}

function buildNode(
  value: JsonValue,
  key: string | undefined,
  path: readonly PathSegment[],
  depth: number,
  counter: { next: number },
): JsonTreeNode {
  const id = counter.next++;
  const base = { id, path, depth, key, truncated: false };

  if (value === null) {
    return { ...base, type: "null", value: null, childCount: 0, totalNodes: 1 };
  }
  switch (typeof value) {
    case "string":
      return { ...base, type: "string", value, childCount: 0, totalNodes: 1 };
    case "number":
      return { ...base, type: "number", value, childCount: 0, totalNodes: 1 };
    case "boolean":
      return { ...base, type: "boolean", value, childCount: 0, totalNodes: 1 };
  }

  if (Array.isArray(value)) {
    const children = value.map((item, i) =>
      buildNode(item, undefined, [...path, i], depth + 1, counter),
    );
    const totalNodes = children.reduce((s, c) => s + c.totalNodes, 1);
    return {
      ...base,
      type: "array",
      children,
      childCount: children.length,
      totalNodes,
    };
  }

  // Object
  const children = Object.entries(value).map(([k, v]) =>
    buildNode(v, k, [...path, k], depth + 1, counter),
  );
  const totalNodes = children.reduce((s, c) => s + c.totalNodes, 1);
  return {
    ...base,
    type: "object",
    children,
    childCount: children.length,
    totalNodes,
  };
}

// ── Path helpers ──

/** True for a bare identifier that can use dot notation in a formatted path. */
const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;

/**
 * Format a node path for display/copy as a JSONPath-style string rooted at `$`,
 * e.g. `$.hits.hits[0]._source.user`. Non-identifier keys use bracket-quote
 * notation (`$["weird key"]`). The empty path (root) formats as `$`.
 */
export function formatPath(path: readonly PathSegment[]): string {
  let out = "$";
  for (const seg of path) {
    if (typeof seg === "number") {
      out += `[${seg}]`;
    } else if (IDENTIFIER_RE.test(seg)) {
      out += `.${seg}`;
    } else {
      out += `[${JSON.stringify(seg)}]`;
    }
  }
  return out;
}

// ── Size helpers ──

/** Total number of nodes in the subtree rooted at `node` (including `node`). */
export function countNodes(node: JsonTreeNode): number {
  let total = 1;
  for (const child of node.children ?? []) {
    total += countNodes(child);
  }
  return total;
}
