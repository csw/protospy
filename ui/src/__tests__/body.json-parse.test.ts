import { describe, it, expect } from "vitest";
import { parseAndFormat } from "@ui/body/json-parse-core";

describe("parseAndFormat", () => {
  it("parses valid JSON and returns the parsed value", () => {
    const { parsed } = parseAndFormat('{"hello":"world","n":42}');
    expect(parsed).toEqual({ hello: "world", n: 42 });
  });

  it("pretty-prints the result with 2-space indentation", () => {
    const { prettyText } = parseAndFormat('{"a":1,"b":2}');
    expect(prettyText).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it("round-trips: JSON.parse(prettyText) equals parsed", () => {
    const input = '{"x":[1,2,{"y":true}],"z":null}';
    const { parsed, prettyText } = parseAndFormat(input);
    expect(JSON.parse(prettyText)).toEqual(parsed);
  });

  it("handles arrays at the root", () => {
    const { parsed, prettyText } = parseAndFormat("[1,2,3]");
    expect(parsed).toEqual([1, 2, 3]);
    expect(prettyText).toBe("[\n  1,\n  2,\n  3\n]");
  });

  it("handles a scalar string at the root", () => {
    const { parsed } = parseAndFormat('"hello"');
    expect(parsed).toBe("hello");
  });

  it("handles null at the root", () => {
    const { parsed } = parseAndFormat("null");
    expect(parsed).toBeNull();
  });

  it("handles deeply nested objects", () => {
    const obj = { a: { b: { c: { d: 42 } } } };
    const { parsed } = parseAndFormat(JSON.stringify(obj));
    expect(parsed).toEqual(obj);
  });

  it("throws SyntaxError on invalid JSON", () => {
    expect(() => parseAndFormat("{not valid}")).toThrow(SyntaxError);
  });

  it("throws on truncated JSON", () => {
    expect(() => parseAndFormat('{"key":')).toThrow();
  });

  it("preserves numeric precision for integers in range", () => {
    const { parsed } = parseAndFormat("9007199254740991");
    expect(parsed).toBe(Number.MAX_SAFE_INTEGER);
  });
});
