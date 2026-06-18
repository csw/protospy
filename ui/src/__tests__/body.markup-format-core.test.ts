import { describe, it, expect } from "vitest";
import {
  prettyPrintMarkup,
  tokenizeMarkup,
  type MarkupLine,
} from "@ui/body/markup-format-core";

/** Collect every token type that appears anywhere in the lines. */
function typesIn(lines: MarkupLine[]): Set<string> {
  const types = new Set<string>();
  for (const line of lines) for (const t of line) types.add(t.type);
  return types;
}

/** Reconstruct the source text from tokenized lines (round-trip check). */
function textOf(lines: MarkupLine[]): string {
  return lines.map((line) => line.map((t) => t.text).join("")).join("\n");
}

describe("prettyPrintMarkup", () => {
  it("re-indents minified XML into multiple lines", () => {
    const out = prettyPrintMarkup('<a><b x="1">hi</b><c/></a>', "xml");
    const lines = out.split("\n");
    expect(lines.length).toBeGreaterThan(3);
    // Children are indented under their parent.
    expect(lines.some((l) => /^\s+<b/.test(l))).toBe(true);
  });

  it("re-indents minified HTML into multiple lines", () => {
    const out = prettyPrintMarkup(
      "<html><head><title>T</title></head><body><p>hi</p></body></html>",
      "html",
    );
    const lines = out.split("\n");
    expect(lines.length).toBeGreaterThan(3);
    expect(out).toContain("<title>");
  });

  it("returns the original text unchanged for unparseable XML (never throws)", () => {
    const unparseable = "not xml at all <<<";
    expect(prettyPrintMarkup(unparseable, "xml")).toBe(unparseable);
  });
});

describe("tokenizeMarkup", () => {
  it("splits output into per-line token arrays preserving text", () => {
    const src = "<a>\n  <b>x</b>\n</a>";
    const lines = tokenizeMarkup(src);
    expect(lines.length).toBe(3);
    expect(textOf(lines)).toBe(src);
  });

  it("classifies tag, attribute, value, punctuation, and entity tokens", () => {
    const lines = tokenizeMarkup('<b x="1">hi &amp; bye</b>');
    const types = typesIn(lines);
    expect(types).toContain("tag");
    expect(types).toContain("attr-name");
    expect(types).toContain("attr-value");
    expect(types).toContain("punctuation");
    expect(types).toContain("entity");
    // Plain text between tags carries the empty (un-highlighted) type.
    expect(types).toContain("");
  });

  it("classifies comments and splits a multi-line comment across lines", () => {
    const lines = tokenizeMarkup("<a>\n<!-- one\ntwo -->\n</a>");
    expect(lines.length).toBe(4);
    expect(typesIn(lines)).toContain("comment");
    // The comment spans two physical lines (line index 1 and 2).
    expect(lines[1].some((t) => t.type === "comment")).toBe(true);
    expect(lines[2].some((t) => t.type === "comment")).toBe(true);
  });

  it("returns a single empty line for empty input", () => {
    expect(tokenizeMarkup("")).toEqual([[]]);
  });
});
