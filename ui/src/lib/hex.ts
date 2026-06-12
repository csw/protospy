// Hex + ASCII dump formatting for the `hex` body view mode (PRO-336). Pure
// helpers so the row formatting is unit-testable without a DOM; `HexView`
// (components/hex-view.tsx) virtualizes the rows these produce.

/** Bytes rendered per dump row — the classic 16-wide hexdump layout. */
export const HEX_BYTES_PER_ROW = 16;

export interface HexRow {
  /** 8-digit zero-padded hex byte offset of the row's first byte. */
  offset: string;
  /**
   * Space-separated two-digit hex byte values, padded with spaces on the final
   * short row so the ASCII gutter stays column-aligned across rows.
   */
  hex: string;
  /** ASCII gutter; non-printable bytes (< 0x20 || > 0x7e) render as ".". */
  ascii: string;
}

/** Number of dump rows for a body of `len` bytes (0 bytes → 0 rows). */
export function hexRowCount(len: number): number {
  return Math.ceil(len / HEX_BYTES_PER_ROW);
}

function toHexByte(b: number): string {
  return b.toString(16).padStart(2, "0");
}

/** Format a single dump row by index. Assumes `0 <= rowIndex < hexRowCount`. */
export function hexRow(bytes: Uint8Array, rowIndex: number): HexRow {
  const start = rowIndex * HEX_BYTES_PER_ROW;
  const end = Math.min(start + HEX_BYTES_PER_ROW, bytes.length);

  const hexParts: string[] = [];
  let ascii = "";
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    hexParts.push(toHexByte(b));
    ascii += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".";
  }
  // Pad the final short row so the ASCII column lines up with full rows.
  while (hexParts.length < HEX_BYTES_PER_ROW) hexParts.push("  ");

  return {
    offset: start.toString(16).padStart(8, "0"),
    hex: hexParts.join(" "),
    ascii,
  };
}

/** The full dump as one newline-joined `offset  hex  |ascii|` string, for Copy. */
export function hexDumpText(bytes: Uint8Array): string {
  const rows: string[] = [];
  for (let r = 0; r < hexRowCount(bytes.length); r++) {
    const { offset, hex, ascii } = hexRow(bytes, r);
    rows.push(`${offset}  ${hex}  |${ascii}|`);
  }
  return rows.join("\n");
}
