/**
 * JsonTreeViewer — a collapsible, virtualized JSON tree (PRO-397–PRO-400,
 * phases 1a–3).
 *
 * Renders either a single JSON value (`value`) or an NDJSON/JSONL body as a
 * forest of per-line document trees (`documents`) as a collapse-by-default tree
 * over a flattened, virtualized row list. When `initialRows` / `initialExpanded`
 * are provided (pre-built by the Web Worker, PRO-399 phase 2), the component uses
 * them for the initial render and builds the tree lazily on the first user
 * interaction.
 *
 * Phase 3 (PRO-400) adds: NDJSON multi-document display (one collapsible tree per
 * line in a single virtualized stream), a truncation banner + in-tree cut-point
 * marker for best-effort-parsed bodies, and copy-value / copy-path on any node
 * via a right-click context menu.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { observeElementRectWithFallback } from "@ui/lib/virtual";
import { ChevronRight, AlertTriangle } from "lucide-react";
import { cn } from "@ui/lib/utils";
import { Button } from "@ui/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@ui/components/ui/context-menu";
import { notifyCopied, notifyCopyFailed } from "@ui/lib/toast";
import {
  buildJsonTree,
  buildJsonForest,
  markTruncationPoint,
  nodeToValue,
  formatPath,
  type JsonTreeNode,
  type JsonValue,
} from "./model";
import { computeDefaultExpanded, computeForestDefaultExpanded } from "./expand";
import { flattenForest, CONTAINER_WINDOW, type FlatRow } from "./flatten";

// One row is a single `leading-5` line (20px). Used as the virtualizer's size
// estimate and as the jsdom measurement fallback; real heights come from
// `measureElement`.
const ROW_HEIGHT = 20;

/** Pixels of indentation per nesting depth level. */
const INDENT_PX = 16;

const DEFAULT_LABEL = "JSON tree viewer";

/** Find the node with the given ID anywhere in the forest, or null. */
function findNodeById(
  roots: readonly JsonTreeNode[],
  targetId: number,
): JsonTreeNode | null {
  for (const root of roots) {
    const found = findNodeInSubtree(root, targetId);
    if (found) return found;
  }
  return null;
}

function findNodeInSubtree(
  node: JsonTreeNode,
  targetId: number,
): JsonTreeNode | null {
  if (node.id === targetId) return node;
  for (const child of node.children ?? []) {
    const found = findNodeInSubtree(child, targetId);
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

/** A built forest plus the container IDs to auto-expand for a truncation marker. */
interface BuiltForest {
  roots: JsonTreeNode[];
  /** Container IDs along the path to the truncation point (empty when not truncated). */
  expandAncestors: number[];
}

/**
 * Build the document forest from the current input. A single `value` is a forest
 * of one tree; `documents` builds one tree per NDJSON line. When `truncated`, the
 * last document's cut point is marked and the path to it returned so the viewer
 * can keep that marker visible.
 */
function buildForest(
  value: JsonValue | undefined,
  documents: readonly JsonValue[] | undefined,
  truncated: boolean,
): BuiltForest {
  const roots =
    documents != null
      ? buildJsonForest(documents)
      : [buildJsonTree(value as JsonValue)];
  let expandAncestors: number[] = [];
  if (truncated && roots.length > 0) {
    // NDJSON truncation is line-granular, so the cut document is always the last.
    expandAncestors = markTruncationPoint(roots[roots.length - 1]).ancestorIds;
  }
  return { roots, expandAncestors };
}

/** Compute the default-expanded set for a freshly built forest. */
function defaultExpandedFor(
  built: BuiltForest,
  isForest: boolean,
): Set<number> {
  const expanded = isForest
    ? computeForestDefaultExpanded(built.roots)
    : computeDefaultExpanded(built.roots[0]);
  for (const id of built.expandAncestors) expanded.add(id);
  return expanded;
}

interface JsonTreeViewerProps {
  /**
   * Single JSON value to render. Mutually exclusive with `documents`. The tree
   * model is built lazily (on first interaction) when `initialRows` is provided,
   * or eagerly on mount when it is not.
   */
  value?: JsonValue;
  /**
   * NDJSON/JSONL documents (one parsed value per line). Mutually exclusive with
   * `value`; renders a forest of independently-collapsible document trees in one
   * virtualized stream.
   */
  documents?: readonly JsonValue[];
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
  /**
   * True when the body was truncated and only a valid prefix is shown. Renders a
   * banner above the tree and keeps the in-tree cut-point marker visible.
   */
  truncated?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function JsonTreeViewer({
  value,
  documents,
  initialRows,
  initialExpanded,
  truncated = false,
  className,
  "aria-label": ariaLabel = DEFAULT_LABEL,
}: JsonTreeViewerProps) {
  const isForest = documents != null;

  // The document forest — built lazily when initialRows are provided, or eagerly
  // on mount otherwise. Stored in a ref so mutations don't trigger re-renders.
  const lazyForestRef = useRef<JsonTreeNode[] | null>(null);

  // Truncation cut-point ancestors from an eager build, stashed so the `expanded`
  // state initializer can keep the marker visible (the worker path ships these in
  // `initialExpanded` instead).
  const initialExpandAncestorsRef = useRef<number[]>([]);

  // Always-fresh copies so the ensureForest closure stays current without adding
  // the inputs to every callback's dep array.
  const inputsRef = useRef({ value, documents, truncated, isForest });
  inputsRef.current = { value, documents, truncated, isForest };

  // The input identity used to detect a changed body (the documents array or the
  // single value). New body → reset expansion + rebuild.
  const input = documents ?? value;

  // treeReady: false → use initialRows; true → flattenForest.
  // The initializer may build the forest immediately (immediate mode).
  const [treeReady, setTreeReady] = useState<boolean>(() => {
    if (!initialRows) {
      const built = buildForest(value, documents, truncated);
      lazyForestRef.current = built.roots;
      initialExpandAncestorsRef.current = built.expandAncestors;
      return true;
    }
    return false;
  });

  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => {
    if (initialExpanded) return initialExpanded;
    if (lazyForestRef.current) {
      return defaultExpandedFor(
        {
          roots: lazyForestRef.current,
          expandAncestors: initialExpandAncestorsRef.current,
        },
        isForest,
      );
    }
    return new Set<number>();
  });

  const [limits, setLimits] = useState<ReadonlyMap<number, number>>(
    () => new Map(),
  );

  // The row last targeted by a right-click, read by the single shared context
  // menu hoisted above the scroll container. Null when the target has no node to
  // copy (e.g. a "show-more" control or empty space).
  const [menuRow, setMenuRow] = useState<FlatRow | null>(null);

  // Set by a row's `onContextMenu` so the container's reset (which fires on the
  // same bubbling contextmenu event) knows a row already claimed it and skips the
  // null reset. A ref, not state — it's read and cleared within one event, never
  // rendered. We can't `stopPropagation` in the row handler: Radix's trigger reads
  // the same bubbled event to open the menu, so stopping it would suppress the menu.
  const rowClaimedMenuRef = useRef(false);

  // Reset expansion + forest when a different body is rendered.
  const [prevInput, setPrevInput] = useState(input);
  if (input !== prevInput) {
    setPrevInput(input);
    if (initialRows && initialExpanded !== undefined) {
      lazyForestRef.current = null;
      setTreeReady(false);
      setExpanded(new Set(initialExpanded));
    } else {
      const built = buildForest(value, documents, truncated);
      lazyForestRef.current = built.roots;
      setTreeReady(true);
      setExpanded(defaultExpandedFor(built, isForest));
    }
    setLimits(new Map());
  }

  // Stable ref so toggle can read the current expanded set without adding it
  // to the callback's dep array (expanded changes on every toggle, which would
  // recreate the callback unnecessarily since JsonTreeRow isn't memoized).
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  // Build the forest on demand. Re-created every render (fresh closure over refs),
  // then stored in a ref so the zero-dep callbacks always call the latest version
  // without adding ensureForest to their dep arrays (useLatest pattern). Unlike
  // the useCallback-wrapped callbacks below, this is intentionally a plain
  // function: it is only ever invoked through ensureForestRef, never passed as a
  // prop or dependency, so memoizing its identity would buy nothing.
  const ensureForestRef = useRef<() => JsonTreeNode[]>(null!);
  function ensureForest(): JsonTreeNode[] {
    if (!lazyForestRef.current) {
      const cur = inputsRef.current;
      lazyForestRef.current = buildForest(
        cur.value,
        cur.documents,
        cur.truncated,
      ).roots;
    }
    return lazyForestRef.current;
  }
  ensureForestRef.current = ensureForest;

  const rows = useMemo<readonly FlatRow[]>(() => {
    if (!treeReady && initialRows) return initialRows;
    if (!lazyForestRef.current) return [];
    return flattenForest(lazyForestRef.current, expanded, limits);
  }, [treeReady, initialRows, expanded, limits]);

  const toggle = useCallback((nodeId: number) => {
    const isCollapsing = expandedRef.current.has(nodeId);
    const forest = ensureForestRef.current();
    setTreeReady(true);
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
        const node = findNodeById(forest, nodeId);
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
    ensureForestRef.current();
    setTreeReady(true);
    setLimits((prev) => {
      const next = new Map(prev);
      const current = next.get(nodeId) ?? CONTAINER_WINDOW;
      next.set(nodeId, Math.min(current + CONTAINER_WINDOW, total));
      return next;
    });
  }, []);

  const showAll = useCallback((nodeId: number, total: number) => {
    ensureForestRef.current();
    setTreeReady(true);
    setLimits((prev) => new Map(prev).set(nodeId, total));
  }, []);

  // Copy a node's value (pretty-printed) or its JSONPath-style path. The forest
  // is built on demand so copy works even before the first expand/collapse.
  const copyValue = useCallback((nodeId: number) => {
    const node = findNodeById(ensureForestRef.current(), nodeId);
    if (!node) return;
    void copyToClipboard(JSON.stringify(nodeToValue(node), null, 2));
  }, []);

  const copyPath = useCallback((row: FlatRow) => {
    void copyToClipboard(formatPath(row.path));
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
    <div className={cn("flex h-full w-full flex-col", className)}>
      {truncated ? <TruncationBanner multiDoc={isForest} /> : null}
      {/*
       * One context menu hoisted above the virtualizer rather than one per row:
       * each row records itself as the target via `onContextMenu`, and the shared
       * menu reads `menuRow`. This keeps a single Radix root regardless of how many
       * rows are visible.
       */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={parentRef}
            className="min-h-0 flex-1 overflow-auto font-mono text-xs leading-5"
            // `contain: layout` (not `strict`) keeps the perf isolation while leaving
            // paint un-clipped, so rows wider than the viewport scroll horizontally
            // rather than getting cut off (deep nesting / long values).
            style={{ contain: "layout" }}
            aria-label={ariaLabel}
            // Right-clicking empty space (below/between rows) clears the target so
            // the shared menu shows disabled items instead of acting on whichever
            // row was right-clicked last. A row's handler fires first (bubbling)
            // and sets the claim flag, so a right-click on a row keeps that row.
            onContextMenu={() => {
              if (rowClaimedMenuRef.current) {
                rowClaimedMenuRef.current = false;
                return;
              }
              setMenuRow(null);
            }}
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
                const expandable =
                  row.kind === "open" || row.kind === "collapsed";
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
                    // Record the right-clicked row so the shared menu copies the
                    // right node. "show-more" rows have no node, so disable copy.
                    // Claim the event so the container's reset (which sees the same
                    // bubbled event) doesn't overwrite this row with null.
                    onContextMenu={() => {
                      rowClaimedMenuRef.current = true;
                      setMenuRow(row.kind === "show-more" ? null : row);
                    }}
                  >
                    {isForest ? <DocGutter row={row} /> : null}
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
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            disabled={menuRow == null}
            onSelect={() => menuRow && copyValue(menuRow.nodeId)}
          >
            Copy value
          </ContextMenuItem>
          <ContextMenuItem
            disabled={menuRow == null}
            onSelect={() => menuRow && copyPath(menuRow)}
          >
            Copy path
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

/** Write `text` to the clipboard with a success/failure toast. */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    notifyCopied();
  } catch {
    notifyCopyFailed();
  }
}

/**
 * Banner shown above the tree when the body was truncated and only a valid
 * prefix is rendered. Announced to assistive tech via `role="status"` so the
 * partial-data caveat is conveyed by text, not color alone.
 */
function TruncationBanner({ multiDoc }: { multiDoc: boolean }) {
  return (
    <div
      role="status"
      data-testid="json-truncation-banner"
      className="flex shrink-0 items-center gap-2 border-b border-border bg-truncation-bg px-3 py-1.5"
    >
      <AlertTriangle size={14} className="shrink-0 text-truncation" />
      <span className="min-w-0 font-sans text-xs text-truncation wrap-anywhere">
        {multiDoc
          ? "Body truncated — showing the documents parsed so far."
          : "Body truncated — showing the valid prefix."}
      </span>
    </div>
  );
}

/**
 * NDJSON document gutter: a fixed-width left column carrying the 1-based document
 * number on each document's first row, blank otherwise so every row stays aligned
 * (a line-number-style gutter). Rendered by the parent loop for forest bodies.
 */
function DocGutter({ row }: { row: FlatRow }) {
  return (
    <span
      className="inline-flex w-10 shrink-0 justify-end pr-3 text-json-lineno select-none"
      // Blank gutter cells carry no number — hide them from assistive tech.
      // `|| undefined` drops the attribute entirely on numbered rows.
      aria-hidden={row.docIndex == null || undefined}
    >
      {row.docIndex != null ? row.docIndex + 1 : null}
    </span>
  );
}

/** A single rendered row: indent + toggle + key/value (gutter is sibling). */
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
        {row.truncated ? <TruncationMarker /> : null}
      </span>
    </>
  );
}

/**
 * In-tree cut-point marker appended to the last node parsed from a truncated
 * body. The text label ("truncated here"), not color alone, carries the meaning.
 */
function TruncationMarker() {
  return (
    <span
      data-testid="json-truncation-marker"
      className="ml-2 inline-flex items-center gap-1 text-truncation italic"
    >
      <AlertTriangle size={12} className="shrink-0" aria-hidden />
      truncated here
    </span>
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
