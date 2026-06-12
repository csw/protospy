import { describe, it, expect } from "vitest";
import {
  HEX_BYTES_PER_ROW,
  hexRowCount,
  hexRow,
  hexDumpText,
} from "@ui/lib/hex";

function bytes(...vals: number[]): Uint8Array {
  return new Uint8Array(vals);
}

describe("hexRowCount", () => {
  it("is 0 for an empty body", () => {
    expect(hexRowCount(0)).toBe(0);
  });

  it("rounds up to whole rows of 16 bytes", () => {
    expect(hexRowCount(1)).toBe(1);
    expect(hexRowCount(16)).toBe(1);
    expect(hexRowCount(17)).toBe(2);
    expect(hexRowCount(33)).toBe(3);
  });
});

describe("hexRow", () => {
  it("formats offset, hex pairs, and ASCII gutter for a full row", () => {
    // 'A'..'P' (0x41..0x50) — 16 printable bytes.
    const data = bytes(...Array.from({ length: 16 }, (_, i) => 0x41 + i));
    const row = hexRow(data, 0);
    expect(row.offset).toBe("00000000");
    expect(row.hex).toBe("41 42 43 44 45 46 47 48 49 4a 4b 4c 4d 4e 4f 50");
    expect(row.ascii).toBe("ABCDEFGHIJKLMNOP");
  });

  it("uses an 8-digit hex offset keyed to the row index", () => {
    const data = bytes(...new Array<number>(20).fill(0x2e));
    expect(hexRow(data, 1).offset).toBe("00000010"); // second row → byte 16
  });

  it("renders non-printable bytes as '.' in the ASCII gutter", () => {
    // 0x00 (control), 0x41 'A', 0x7f (DEL, non-printable), 0x80 (high).
    const row = hexRow(bytes(0x00, 0x41, 0x7f, 0x80), 0);
    expect(row.ascii).toBe(".A..");
  });

  it("pads the hex column on a short final row so ASCII stays aligned", () => {
    const shortRow = hexRow(bytes(0x41, 0x42), 0);
    const fullRow = hexRow(
      bytes(...Array.from({ length: HEX_BYTES_PER_ROW }, () => 0x41)),
      0,
    );
    // Padded short row keeps the same column width as a full row.
    expect(shortRow.hex).toHaveLength(fullRow.hex.length); // 16*2 + 15 = 47
    expect(shortRow.hex.startsWith("41 42 ")).toBe(true);
    // Only the two real bytes contribute to the ASCII gutter.
    expect(shortRow.ascii).toBe("AB");
  });
});

describe("hexDumpText", () => {
  it("joins rows as 'offset  hex  |ascii|'", () => {
    const dump = hexDumpText(bytes(0x68, 0x69)); // 'hi'
    expect(dump).not.toContain("\n");
    expect(dump.startsWith("00000000  68 69")).toBe(true);
    expect(dump.endsWith("|hi|")).toBe(true);
    // offset(8) + 2 + hex(16*2 + 15) + 2 + |ascii|(4)
    expect(dump).toHaveLength(8 + 2 + 47 + 2 + 4);
  });

  it("is empty for an empty body", () => {
    expect(hexDumpText(bytes())).toBe("");
  });

  it("emits one line per 16-byte row", () => {
    const data = bytes(...new Array<number>(20).fill(0x61));
    expect(hexDumpText(data).split("\n")).toHaveLength(2);
  });
});
