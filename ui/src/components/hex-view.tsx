import { useRef } from "react";
import {
  useVirtualizer,
  observeElementRect as defaultObserveRect,
} from "@tanstack/react-virtual";
import { HEX_BYTES_PER_ROW, hexRow, hexRowCount } from "@ui/lib/hex";

interface Props {
  bytes: Uint8Array;
}

// `text-xs` (12px) + `leading-5` (20px) — each dump row renders as a 20px row.
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

/**
 * Wrapper around the default observeElementRect that reports a fallback rect in
 * jsdom (where getBoundingClientRect is 0x0), so the virtualizer renders items
 * and component tests can assert on them. Mirrors the json-tree viewer pattern.
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
 * A hex + ASCII dump of the decompressed body bytes — the `hex` view mode
 * (PRO-336). Rows are fixed-height with no wrapping, so the flat-viewer
 * fixed-height virtualization pattern applies directly. The scroll content is
 * `ROW_COLS` wide so a full 16-byte row scrolls horizontally rather than
 * clipping its ASCII gutter inside a narrow split pane.
 */
export function HexView({ bytes }: Props) {
  const rowCount = hexRowCount(bytes.length);
  const parentRef = useRef<HTMLDivElement>(null);

  // React Compiler bails on useVirtualizer (react-hooks/incompatible-library);
  // safe here — the compiler isn't enabled and the methods are consumed inline.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rowCount,
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
      aria-label={VIEWER_LABEL}
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
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
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
