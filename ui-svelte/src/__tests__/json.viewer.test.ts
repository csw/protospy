import { describe, it, expect } from "vitest";
import { tokenizeLine } from "@ui/components/JsonViewer.svelte";

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
});
