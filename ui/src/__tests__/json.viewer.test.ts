import { describe, it, expect } from "vitest";
import { tokenizeLine } from "@ui/components/JsonViewer";

describe("tokenizeLine", () => {
  it("returns empty array for empty string", () => {
    expect(tokenizeLine("")).toEqual([]);
  });

  it("preserves leading whitespace as unstyled string token", () => {
    const tokens = tokenizeLine('    "key": "val"');
    expect(typeof tokens[0]).toBe("string");
    expect(tokens[0]).toBe("    ");
  });

  it("tokenizes a property key with colon", () => {
    const tokens = tokenizeLine('  "name": "Alice"');
    expect(tokens).toContainEqual({ cls: "text-j-key", text: '"name"' });
    expect(tokens).toContainEqual({ cls: "text-j-punct", text: ":" });
    expect(tokens).toContainEqual({ cls: "text-j-str", text: '"Alice"' });
  });

  it("tokenizes a string value", () => {
    const tokens = tokenizeLine(' "hello world"');
    expect(tokens).toContainEqual({
      cls: "text-j-str",
      text: '"hello world"',
    });
  });

  it("tokenizes an integer", () => {
    const tokens = tokenizeLine(" 42");
    expect(tokens).toContainEqual({ cls: "text-j-num", text: "42" });
  });

  it("tokenizes a negative float", () => {
    const tokens = tokenizeLine(" -3.14");
    expect(tokens).toContainEqual({ cls: "text-j-num", text: "-3.14" });
  });

  it("tokenizes boolean true", () => {
    const tokens = tokenizeLine(" true");
    expect(tokens).toContainEqual({ cls: "text-j-bool", text: "true" });
  });

  it("tokenizes boolean false", () => {
    const tokens = tokenizeLine(" false");
    expect(tokens).toContainEqual({ cls: "text-j-bool", text: "false" });
  });

  it("tokenizes null as bool-class token", () => {
    const tokens = tokenizeLine(" null");
    expect(tokens).toContainEqual({ cls: "text-j-bool", text: "null" });
  });

  it("tokenizes opening brace as punctuation", () => {
    const tokens = tokenizeLine("{");
    expect(tokens).toContainEqual({ cls: "text-j-punct", text: "{" });
  });

  it("tokenizes a full key-number-comma line", () => {
    const tokens = tokenizeLine('  "age": 30,');
    const clsList = tokens
      .filter((t): t is { cls: string; text: string } => typeof t !== "string")
      .map((t) => t.cls);
    expect(clsList).toContain("text-j-key");
    expect(clsList).toContain("text-j-punct"); // colon and comma
    expect(clsList).toContain("text-j-num");
  });

  it("tokenizes a string containing escaped quotes as one string token", () => {
    // Source character sequence: "\"foo\""
    const tokens = tokenizeLine('"\\"foo\\""');
    expect(tokens).toEqual([{ cls: "text-j-str", text: '"\\"foo\\""' }]);
  });

  it("tokenizes a string containing an escaped backslash as one string token", () => {
    // Source character sequence: "\\"
    const tokens = tokenizeLine('"\\\\"');
    expect(tokens).toEqual([{ cls: "text-j-str", text: '"\\\\"' }]);
  });

  it("tokenizes a string containing escaped control chars as one string token", () => {
    // Source character sequence: "line1\nline2"
    const tokens = tokenizeLine('"line1\\nline2"');
    expect(tokens).toEqual([{ cls: "text-j-str", text: '"line1\\nline2"' }]);
  });

  it("tokenizes strings containing \\t and \\r escapes as single string tokens", () => {
    expect(tokenizeLine('"a\\tb"')).toEqual([
      { cls: "text-j-str", text: '"a\\tb"' },
    ]);
    expect(tokenizeLine('"a\\rb"')).toEqual([
      { cls: "text-j-str", text: '"a\\rb"' },
    ]);
  });

  it("tokenizes a string containing a unicode escape as one string token", () => {
    // Source character sequence: "A" (literal backslash-u-0041, not the
    // character A). The tokenizer treats \u as just another escape via \\.
    const tokens = tokenizeLine('"\\u0041"');
    expect(tokens).toEqual([{ cls: "text-j-str", text: '"\\u0041"' }]);
  });

  it("tokenizes scientific notation numbers as single number tokens", () => {
    expect(tokenizeLine("1e10")).toEqual([{ cls: "text-j-num", text: "1e10" }]);
    expect(tokenizeLine("1.5e-3")).toEqual([
      { cls: "text-j-num", text: "1.5e-3" },
    ]);
    expect(tokenizeLine("-2.5E5")).toEqual([
      { cls: "text-j-num", text: "-2.5E5" },
    ]);
  });

  it("tokenizes opening and closing brackets as punctuation", () => {
    expect(tokenizeLine("[")).toEqual([{ cls: "text-j-punct", text: "[" }]);
    expect(tokenizeLine("]")).toEqual([{ cls: "text-j-punct", text: "]" }]);
  });

  it("treats only the key colon as separator when value is a URL containing colons", () => {
    // The colons inside the URL string are part of the string token; only
    // the key-colon is split out as its own punctuation token.
    const tokens = tokenizeLine('  "url": "https://example.com/path"');
    expect(tokens).toContainEqual({ cls: "text-j-key", text: '"url"' });
    expect(tokens).toContainEqual({
      cls: "text-j-str",
      text: '"https://example.com/path"',
    });
    // There should be exactly one colon-punctuation token (the separator).
    const colonTokens = tokens.filter(
      (t): t is { cls: string; text: string } =>
        typeof t !== "string" && t.cls === "text-j-punct" && t.text === ":",
    );
    expect(colonTokens).toHaveLength(1);
  });

  it("preserves trailing whitespace as an unstyled string token", () => {
    // The leading-whitespace branch captures any whitespace at the start of
    // the remaining input, so trailing whitespace ends up as a final
    // unstyled string token.
    const tokens = tokenizeLine('"value"   ');
    expect(tokens).toEqual([{ cls: "text-j-str", text: '"value"' }, "   "]);
  });
});
