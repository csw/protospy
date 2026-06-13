/**
 * Public surface of the JSON tree viewer subpackage (phase 1a, PRO-397).
 *
 * `JsonTreeViewer` is the component; the rest is the pure tree model, flattener,
 * and collapse heuristics it is built from (exported for tests and for the later
 * phases that wire it in).
 */

export { JsonTreeViewer } from "./json-tree-viewer";

export {
  buildJsonTree,
  formatPath,
  countNodes,
  type JsonPrimitive,
  type JsonValue,
  type JsonNodeType,
  type PathSegment,
  type JsonTreeNode,
} from "./model";

export {
  flattenTree,
  formatPrimitive,
  CONTAINER_WINDOW,
  type FlatRowKind,
  type FlatRow,
} from "./flatten";

export {
  computeDefaultExpanded,
  DEFAULT_EXPAND_DEPTH,
  LARGE_CONTAINER_CHILD_COUNT,
  SMALL_TREE_NODE_COUNT,
  type DefaultExpandOptions,
} from "./expand";
