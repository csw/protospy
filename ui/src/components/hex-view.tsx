import { useCallback, useRef, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { observeElementRectWithFallback } from "@ui/lib/virtual";
import { HEX_BYTES_PER_ROW, hexRow, hexRowCount } from "@ui/lib/hex";

interface Props {
  bytes: Uint8Array;
}

// `leading-5` (20px) fixes the row box height regardless of the density-aware
// `text-mono` font size — each dump row renders as a 20px row.
const ROW_HEIGHT = 20;

// Fixed character width of a full row: offset(8) + "  " + hex(16*2 + 15 spaces)
// + "  " + ascii(16). Used to size the scroll content so a row wider than the
// (narrow, split) body pane scrolls horizontally instead of clipping.
const ROW_COLS =
  8 +
  2 +
  (HEX_BYTES_PER_ROW * 2 + (HEX_BYTES_PER_ROW - 1)) +
  2 +
  HEX_BYTES_PER_ROW;

const VIEWER_LABEL = "Hex viewer";

const estimateRowSize = () => ROW_HEIGHT;

// Static positioning shared by every virtual row — hoisted so the per-row style
// object only carries the dynamic `height`/`transform`. Matches the text/markup
// viewers.
const ROW_BASE_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
};

/**
 * A hex + ASCII dump of the decompressed body bytes — the `hex` view mode
 * (PRO-336). Rows are fixed-height with no wrapping, so the flat-viewer
 * fixed-height virtualization pattern applies directly. The scroll content is
 * `ROW_COLS` wide so a full 16-byte row scrolls horizontally rather than
 * clipping its ASCII gutter inside a narrow split pane.
 */
export function HexView({ bytes }: Props) {
  const rowCount = hexRowCount(bytes.length);
  const parentRef = useRef<HTMLDivElement>(null);

  // Stable accessor so the virtualizer config object doesn't carry a fresh
  // closure each render (`parentRef` is itself stable).
  const getScrollElement = useCallback(() => parentRef.current, []);

  // React Compiler bails on useVirtualizer (react-hooks/incompatible-library);
  // safe here — the compiler isn't enabled and the methods are consumed inline.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement,
    estimateSize: estimateRowSize,
    overscan: 10,
    observeElementRect: observeElementRectWithFallback,
  });

  return (
    <div
      ref={parentRef}
      role="region"
      aria-label={VIEWER_LABEL}
      className="font-mono text-mono leading-5 overflow-auto w-full h-full pt-3"
      style={{ contain: "strict" }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: `${ROW_COLS}ch`,
          minWidth: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => {
          const { offset, hex, ascii } = hexRow(bytes, vRow.index);
          return (
            <div
              key={vRow.key}
              className="whitespace-pre px-3 hover:bg-hover"
              style={{
                ...ROW_BASE_STYLE,
                height: vRow.size,
                transform: `translateY(${vRow.start}px)`,
              }}
            >
              <span className="select-none text-muted-foreground">
                {offset}
              </span>
              {"  "}
              <span className="text-foreground">{hex}</span>
              {"  "}
              <span className="text-muted-foreground">{ascii}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
