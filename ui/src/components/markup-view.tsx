import { useMemo, useRef } from "react";
import {
  useVirtualizer,
  observeElementRect as defaultObserveRect,
} from "@tanstack/react-virtual";
import type { MarkupLine } from "@ui/body/markup-format-core";

interface Props {
  /** Per-line highlight tokens from the markup-format Worker. */
  lines: MarkupLine[];
  /** Accessible label — "HTML viewer" or "XML viewer". */
  label: string;
}

// `text-xs` (12px) + `leading-5` (20px) — each line renders as a 20px row,
// matching the hex and JSON viewers so virtualization heights stay uniform.
const ROW_HEIGHT = 20;

/**
 * Map a Prism markup token type to its color class. Unknown types (and plain
 * text, `""`) fall through to the body foreground. Colors are design tokens
 * (`--markup-*` in globals.css), so both themes resolve without inline styles.
 */
function tokenClass(type: string): string {
  switch (type) {
    case "tag":
      return "text-markup-tag";
    case "attr-name":
      return "text-markup-attr-name";
    case "attr-value":
      return "text-markup-attr-value";
    case "punctuation":
      return "text-markup-punct";
    case "comment":
    case "prolog":
    case "doctype":
    case "cdata":
      return "text-markup-comment";
    case "entity":
    case "named-entity":
      return "text-markup-entity";
    default:
      return "text-foreground";
  }
}

/**
 * Wrapper around the default observeElementRect that reports a fallback rect in
 * jsdom (where getBoundingClientRect is 0x0) so the virtualizer renders items
 * and component tests can assert on them. Mirrors the hex/json-tree viewers.
 */
const observeElementRect: typeof defaultObserveRect = (instance, cb) => {
  return defaultObserveRect(instance, (rect) => {
    if (rect.width === 0 && rect.height === 0) {
      cb({ width: 800, height: 600 });
    } else {
      cb(rect);
    }
  });
};

/**
 * The `formatted` view mode for HTML/XML bodies (PRO-414): syntax-highlighted,
 * re-indented markup. Lines are fixed-height and non-wrapping, so the
 * flat-viewer virtualization pattern (hex-view) applies directly — only visible
 * rows plus overscan are in the DOM, keeping multi-MB SOAP/RSS bodies smooth.
 * Long lines scroll horizontally rather than wrapping (wrapping would break
 * fixed-height virtualization).
 */
export function MarkupView({ lines, label }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Size the line-number gutter to the actual line count, and the scroll
  // content to the widest line so a long line scrolls horizontally instead of
  // clipping. Recomputed only when the line set changes.
  const { gutterWidth, contentCols } = useMemo(() => {
    const digits = Math.max(Math.ceil(Math.log10(lines.length + 1)), 2);
    let maxCols = 0;
    for (const line of lines) {
      let cols = 0;
      for (const token of line) cols += token.text.length;
      if (cols > maxCols) maxCols = cols;
    }
    return { gutterWidth: digits, contentCols: digits + 1 + maxCols };
  }, [lines]);

  // React Compiler bails on useVirtualizer (react-hooks/incompatible-library);
  // safe here — the compiler isn't enabled and the methods are consumed inline.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    observeElementRect,
  });

  return (
    <div
      ref={parentRef}
      className="font-mono text-xs leading-5 overflow-auto w-full h-full pt-3"
      style={{ contain: "strict" }}
      aria-label={label}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: `${contentCols}ch`,
          minWidth: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => {
          const line = lines[vRow.index];
          return (
            <div
              key={vRow.key}
              data-testid="markup-line"
              className="whitespace-pre px-3 hover:bg-hover"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: vRow.size,
                transform: `translateY(${vRow.start}px)`,
              }}
            >
              <span
                data-testid="line-number"
                className="select-none text-muted-foreground"
                style={{ width: `${gutterWidth}ch` }}
              >
                {String(vRow.index + 1).padStart(gutterWidth, " ")}
              </span>{" "}
              {line.map((token, i) => (
                <span key={i} className={tokenClass(token.type)}>
                  {token.text}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
