/**
 * JsonTreeViewer — a collapsible, virtualized JSON tree (PRO-397/PRO-398,
 * phases 1a–1b).
 *
 * Renders a parsed JSON value as a collapse-by-default tree over a flattened,
 * virtualized row list. When `initialRows` / `initialExpanded` are provided
 * (pre-built by the Web Worker, PRO-399 phase 2), the component uses them for
 * the initial render and builds the tree lazily on the first user interaction.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { observeElementRectWithFallback } from "@ui/lib/virtual";
import { ChevronRight } from "lucide-react";
import { cn } from "@ui/lib/utils";
import { Button } from "@ui/components/ui/button";
import { buildJsonTree, type JsonTreeNode, type JsonValue } from "./model";
import { computeDefaultExpanded } from "./expand";
import { flattenTree, CONTAINER_WINDOW, type FlatRow } from "./flatten";

// One row is a single `leading-5` line (20px). Used as the virtualizer's size
// estimate and as the jsdom measurement fallback; real heights come from
// `measureElement`.
const ROW_HEIGHT = 20;

/** Pixels of indentation per nesting depth level. */
const INDENT_PX = 16;

const DEFAULT_LABEL = "JSON tree viewer";

/** Find the subtree node with the given ID, or null if not found. */
function findNodeById(
  node: JsonTreeNode,
  targetId: number,
): JsonTreeNode | null {
  if (node.id === targetId) return node;
  for (const child of node.children ?? []) {
    const found = findNodeById(child, targetId);
    if (found) return found;
  }
  return null;
}

/** Collect IDs of all descendants of `node` (not including `node` itself). */
function collectDescendantIds(node: JsonTreeNode, out: Set<number>): void {
  for (const child of node.children ?? []) {
    out.add(child.id);
    collectDescendantIds(child, out);
  }
}

/**
 * Dynamic row measurement. Falls back to the estimate when the environment
 * reports a 0 height (jsdom), so measured virtualization still yields rows under
 * Vitest while real browsers measure the true height.
 */
function measureElement(el: Element): number {
  const height = el.getBoundingClientRect().height;
  return height > 0 ? height : ROW_HEIGHT;
}

interface JsonTreeViewerProps {
  /**
   * Parsed JSON value to render. The component builds the tree model from it
   * lazily (on first expand/collapse) when `initialRows` is provided, or
   * eagerly on mount when it is not.
   */
  value: JsonValue;
  /**
   * Pre-built flat rows from the Web Worker (PRO-399 phase 2). When provided,
   * used for the initial render to avoid a main-thread tree build. The tree
   * is built lazily on the first user interaction (expand/collapse/show-more).
   */
  initialRows?: readonly FlatRow[];
  /**
   * Pre-computed default expanded set from the Worker, paired with
   * `initialRows`. Ignored when `initialRows` is absent.
   */
  initialExpanded?: ReadonlySet<number>;
  className?: string;
  "aria-label"?: string;
}

export function JsonTreeViewer({
  value,
  initialRows,
  initialExpanded,
  className,
  "aria-label": ariaLabel = DEFAULT_LABEL,
}: JsonTreeViewerProps) {
  // The JSON tree — built lazily when initialRows are provided, or eagerly
  // on mount otherwise. Stored in a ref so mutations don't trigger re-renders.
  const lazyTreeRef = useRef<JsonTreeNode | null>(null);

  // Always-fresh copy of `value` so the ensureTree closure stays current
  // without adding value to every callback's dep array.
  const valueRef = useRef(value);
  valueRef.current = value;

  // treeReady: false → use initialRows; true → flattenTree.
  // The initializer may build the tree immediately (immediate mode).
  const [treeReady, setTreeReady] = useState<boolean>(() => {
    if (!initialRows) {
      lazyTreeRef.current = buildJsonTree(value);
      return true;
    }
    return false;
  });

  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => {
    if (initialExpanded) return initialExpanded;
    if (lazyTreeRef.current) return computeDefaultExpanded(lazyTreeRef.current);
    return new Set<number>();
  });

  const [limits, setLimits] = useState<ReadonlyMap<number, number>>(
    () => new Map(),
  );

  // Reset expansion + tree when a different value is rendered.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (initialRows && initialExpanded !== undefined) {
      lazyTreeRef.current = null;
      setTreeReady(false);
      setExpanded(initialExpanded);
    } else {
      const newTree = buildJsonTree(value);
      lazyTreeRef.current = newTree;
      setTreeReady(true);
      setExpanded(computeDefaultExpanded(newTree));
    }
    setLimits(new Map());
  }

  // Stable ref so toggle can read the current expanded set without adding it
  // to the callback's dep array (expanded changes on every toggle, which would
  // recreate the callback unnecessarily since JsonTreeRow isn't memoized).
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  // Build the tree on demand and signal rows to switch from initialRows to
  // flattenTree. Called from event handlers only (never during render).
  function ensureTree(): JsonTreeNode {
    if (!lazyTreeRef.current) {
      lazyTreeRef.current = buildJsonTree(
        valueRef.current as Parameters<typeof buildJsonTree>[0],
      );
      setTreeReady(true);
    }
    return lazyTreeRef.current;
  }

  const rows = useMemo<readonly FlatRow[]>(() => {
    if (!treeReady && initialRows) return initialRows;
    return flattenTree(lazyTreeRef.current!, expanded, limits);
  }, [treeReady, initialRows, expanded, limits]);

  const toggle = useCallback((nodeId: number) => {
    const isCollapsing = expandedRef.current.has(nodeId);
    const tree = ensureTree();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
    // On collapse: re-window the collapsed node and all its descendants so
    // any "Show more" raise is forgotten and the next expand starts fresh.
    if (isCollapsing) {
      setLimits((prev) => {
        if (prev.size === 0) return prev;
        const node = findNodeById(tree, nodeId);
        if (!node) return prev;
        const toRemove = new Set<number>([nodeId]);
        collectDescendantIds(node, toRemove);
        if (![...toRemove].some((id) => prev.has(id))) return prev;
        const next = new Map(prev);
        for (const id of toRemove) next.delete(id);
        return next;
      });
    }
  }, []);

  const showMore = useCallback((nodeId: number, total: number) => {
    ensureTree();
    setLimits((prev) => {
      const next = new Map(prev);
      const current = next.get(nodeId) ?? CONTAINER_WINDOW;
      next.set(nodeId, Math.min(current + CONTAINER_WINDOW, total));
      return next;
    });
  }, []);

  const showAll = useCallback((nodeId: number, total: number) => {
    ensureTree();
    setLimits((prev) => new Map(prev).set(nodeId, total));
  }, []);

  const parentRef = useRef<HTMLDivElement>(null);

  // React Compiler bails on useVirtualizer (react-hooks/incompatible-library):
  // its methods close over mutable instance state. Safe here — the compiler is
  // not enabled in this build and the returned methods are consumed inline.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    observeElementRect: observeElementRectWithFallback,
    measureElement,
  });

  return (
    <div
      ref={parentRef}
      className={cn(
        "font-mono text-xs leading-5 w-full h-full overflow-auto",
        className,
      )}
      // `contain: layout` (not `strict`) keeps the perf isolation while leaving
      // paint un-clipped, so rows wider than the viewport scroll horizontally
      // rather than getting cut off (deep nesting / long values).
      style={{ contain: "layout" }}
      aria-label={ariaLabel}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => {
          const row = rows[vRow.index];
          const expandable = row.kind === "open" || row.kind === "collapsed";
          return (
            <div
              key={vRow.key}
              data-index={vRow.index}
              ref={virtualizer.measureElement}
              className={cn(
                "absolute top-0 left-0 flex w-max min-w-full items-center hover:bg-hover",
                expandable && "cursor-pointer",
              )}
              style={{ transform: `translateY(${vRow.start}px)` }}
              onClick={expandable ? () => toggle(row.nodeId) : undefined}
            >
              <JsonTreeRow
                row={row}
                onToggle={toggle}
                onShowMore={showMore}
                onShowAll={showAll}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A single rendered row: indent + disclosure toggle + key/value content. */
function JsonTreeRow({
  row,
  onToggle,
  onShowMore,
  onShowAll,
}: {
  row: FlatRow;
  onToggle: (nodeId: number) => void;
  onShowMore: (nodeId: number, total: number) => void;
  onShowAll: (nodeId: number, total: number) => void;
}) {
  if (row.kind === "show-more") {
    return (
      <JsonTreeShowMore
        row={row}
        onShowMore={onShowMore}
        onShowAll={onShowAll}
      />
    );
  }

  const expandable = row.kind === "open" || row.kind === "collapsed";
  return (
    <>
      {/* Indent + toggle column */}
      <span
        className="inline-flex shrink-0 items-center justify-end"
        style={{ width: `${row.depth * INDENT_PX + 16}px` }}
      >
        {expandable ? (
          <Button
            variant="ghost"
            className="size-4 rounded-md text-json-punct"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(row.nodeId);
            }}
            aria-expanded={row.kind === "open"}
            aria-label={row.kind === "open" ? "Collapse" : "Expand"}
          >
            <ChevronRight
              className={cn(
                "transition-transform duration-100",
                row.kind === "open" && "rotate-90",
              )}
            />
          </Button>
        ) : null}
      </span>

      {/* Content */}
      <span className="whitespace-pre">
        {row.key != null ? (
          <>
            <span className="text-json-key">{JSON.stringify(row.key)}</span>
            <span className="text-json-punct">: </span>
          </>
        ) : null}
        <JsonTreeRowValue row={row} />
        {row.hasComma ? <span className="text-json-punct">,</span> : null}
      </span>
    </>
  );
}

/**
 * A windowed container's "show more" row: a remaining-count label plus controls
 * to reveal the next batch or all remaining children. Indented as a child so it
 * lines up under the container's items.
 */
function JsonTreeShowMore({
  row,
  onShowMore,
  onShowAll,
}: {
  row: FlatRow;
  onShowMore: (nodeId: number, total: number) => void;
  onShowAll: (nodeId: number, total: number) => void;
}) {
  const total = row.childCount ?? 0;
  const shown = row.shownCount ?? 0;
  const remaining = total - shown;
  const step = Math.min(CONTAINER_WINDOW, remaining);
  const noun =
    row.containerType === "array"
      ? remaining === 1
        ? "item"
        : "items"
      : remaining === 1
        ? "key"
        : "keys";
  return (
    <>
      <span
        className="inline-flex shrink-0"
        style={{ width: `${row.depth * INDENT_PX + 16}px` }}
      />
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="italic">
          {remaining} more {noun}
        </span>
        <Button
          variant="link"
          className="h-auto p-0 text-xs"
          data-testid="json-tree-show-more"
          onClick={() => onShowMore(row.nodeId, total)}
        >
          Show {step} more
        </Button>
        <Button
          variant="link"
          className="h-auto p-0 text-xs"
          data-testid="json-tree-show-all"
          onClick={() => onShowAll(row.nodeId, total)}
        >
          Show all
        </Button>
      </span>
    </>
  );
}

/** The value portion of a row: bracket, collapsed preview + count, or leaf. */
function JsonTreeRowValue({ row }: { row: FlatRow }) {
  switch (row.kind) {
    case "open":
      return (
        <span className="text-json-punct">
          {row.containerType === "object" ? "{" : "["}
        </span>
      );

    case "close":
      return (
        <span className="text-json-punct">
          {row.containerType === "object" ? "}" : "]"}
        </span>
      );

    case "collapsed": {
      const isArray = row.containerType === "array";
      const count = row.childCount ?? 0;
      // Count badge: arrays show item count, objects show key count.
      const label = isArray
        ? count === 1
          ? "1 item"
          : `${count} items`
        : count === 1
          ? "1 key"
          : `${count} keys`;
      return (
        <>
          <span className="text-json-punct">{isArray ? "[" : "{"}</span>
          <span className="text-muted-foreground italic">{"…"}</span>
          <span className="text-json-punct">{isArray ? "]" : "}"}</span>
          <span className="text-muted-foreground ml-2">{label}</span>
        </>
      );
    }

    case "leaf":
      return <span className={row.valueCls}>{row.valueText}</span>;
  }
}
