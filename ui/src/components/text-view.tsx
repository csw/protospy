import { useCallback, useMemo, useRef, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { observeElementRectWithFallback } from "@ui/lib/virtual";

interface Props {
  text: string;
}

// Estimated height of a single (unwrapped) line at `leading-5` (20px). Soft-
// wrapped lines are taller; their real height comes from `measureElement`, so
// this is only the pre-measurement estimate that seeds the virtualizer.
const ESTIMATED_ROW_HEIGHT = 20;

// Static positioning shared by every virtual row — hoisted so the per-row style
// object only carries the dynamic `transform`. Matches the hex/markup viewers.
const ROW_BASE_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
};

/**
 * The `text` body view mode (PRO-420; also the `formatted` fallback when the
 * markup Worker produces no tokens): the decoded body shown as plain UTF-8 text
 * with a line-number gutter and long-line soft-wrapping (no horizontal scroll,
 * PRO-421).
 *
 * Virtualized (PRO-416) so multi-MB bodies (CSV dumps, logs, bulk text) render
 * without frame drops — only the visible rows plus overscan are in the DOM.
 * Unlike the hex and markup viewers, rows soft-wrap and so are variable-height;
 * each rendered row is measured via `measureElement` rather than assuming a
 * fixed row height.
 */
export function TextView({ text }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => text.split("\n"), [text]);
  // Size gutter to fit the actual line count rather than a fixed reserve.
  // For n lines, log10(n+1) gives the digit count; clamp to 2 chars minimum.
  const gutterWidth = useMemo(
    () => `${Math.max(Math.ceil(Math.log10(lines.length + 1)), 2)}ch`,
    [lines.length],
  );

  // Stable accessor so the virtualizer config object doesn't carry a fresh
  // closure each render (`parentRef` is itself stable).
  const getScrollElement = useCallback(() => parentRef.current, []);

  // React Compiler bails on useVirtualizer (react-hooks/incompatible-library);
  // safe here — the compiler isn't enabled and the methods are consumed inline.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 10,
    observeElementRect: observeElementRectWithFallback,
  });

  return (
    <div
      ref={parentRef}
      aria-label="Body text"
      // `contain: strict` isolates layout/paint/size for scroll perf. It is safe
      // with `measureElement` here because the measured targets are the
      // descendant rows, not this container — containment on a parent does not
      // suppress a child's own ResizeObserver.
      className="font-mono text-mono leading-5 overflow-auto w-full h-full pt-3"
      style={{ contain: "strict" }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => (
          <div
            key={vRow.key}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            className="flex gap-3 px-3"
            style={{
              ...ROW_BASE_STYLE,
              transform: `translateY(${vRow.start}px)`,
            }}
          >
            <span
              data-testid="line-number"
              className="select-none shrink-0 text-right text-muted-foreground"
              style={{ width: gutterWidth }}
            >
              {vRow.index + 1}
            </span>
            <span className="flex-1 whitespace-pre-wrap wrap-anywhere text-foreground">
              {lines[vRow.index]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
