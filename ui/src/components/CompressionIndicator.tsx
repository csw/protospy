import { FileArchive } from "lucide-react";

interface Props {
  /**
   * Value of the body's `Content-Encoding` header (e.g. "gzip", "br", "zstd",
   * "deflate"). When undefined/empty, renders nothing — callers can pass the
   * raw `BodyState.contentEncoding` without guarding.
   */
  encoding: string | undefined;
  /**
   * Icon size in px. Defaults to 11 — sized to sit next to a 12px size label
   * in the exchange list without inflating row height.
   */
  size?: number;
}

/**
 * Small inline icon indicating that a body is compressed on the wire. Used
 * in surfaces where only `wireBytes` is shown (exchange list rows + table,
 * timing view); the body pane has its own "wire → decoded" display.
 *
 * The icon carries a tooltip and accessible label naming the encoding, so
 * users seeing "28 B" plus the indicator can find out the body is gzipped
 * without leaving the row.
 */
export function CompressionIndicator({ encoding, size = 11 }: Props) {
  if (!encoding) return null;
  const label = `Compressed: ${encoding}`;
  return (
    <span
      data-testid="compression-indicator"
      title={label}
      aria-label={label}
      role="img"
      className="inline-flex items-center text-dim shrink-0"
    >
      <FileArchive size={size} aria-hidden="true" />
    </span>
  );
}
