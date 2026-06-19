import { useCallback, useMemo, useRef, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { observeElementRectWithFallback } from "@ui/lib/virtual";
import type { MarkupLine } from "@ui/body/markup-format-core";

interface Props {
  /** Per-line highlight tokens from the markup-format Worker. */
  lines: MarkupLine[];
  /** Accessible label — "HTML viewer" or "XML viewer". */
  label: string;
}

// `leading-5` (20px) fixes the line box height regardless of the density-aware
// `text-mono` font size — each line renders as a 20px row, matching the hex and
// JSON viewers so virtualization heights stay uniform.
const ROW_HEIGHT = 20;

// Static positioning shared by every virtual row — hoisted so the per-row style
// object only carries the dynamic `height`/`transform`. Matches the text/hex
// viewers.
const ROW_BASE_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
};

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
 * The `formatted` view mode for HTML/XML bodies (PRO-414): syntax-highlighted,
 * re-indented markup. Lines are fixed-height and non-wrapping, so the
 * flat-viewer virtualization pattern (hex-view) applies directly — only visible
 * rows plus overscan are in the DOM, keeping multi-MB SOAP/RSS bodies smooth.
 * Long lines scroll horizontally rather than wrapping (wrapping would break
 * fixed-height virtualization).
 */
export function MarkupView({ lines, label }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Stable accessor so the virtualizer config object doesn't carry a fresh
  // closure each render (`parentRef` is itself stable).
  const getScrollElement = useCallback(() => parentRef.current, []);

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
    getScrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    observeElementRect: observeElementRectWithFallback,
  });

  return (
    <div
      ref={parentRef}
      role="region"
      aria-label={label}
      className="font-mono text-mono leading-5 overflow-auto w-full h-full pt-3"
      style={{ contain: "strict" }}
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
                ...ROW_BASE_STYLE,
                height: vRow.size,
                transform: `translateY(${vRow.start}px)`,
              }}
            >
              <span
                data-testid="line-number"
                className="select-none text-muted-foreground"
              >
                {String(vRow.index + 1).padStart(gutterWidth, " ")}
              </span>{" "}
              {/* Index keys are correct here: each line's token list is static
                  and never reordered or spliced after the Worker produces it. */}
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
