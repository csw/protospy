import { describe, it, expect } from "vitest";
import {
  parseAndFormat,
  parseWithTruncation,
  parseNdjson,
} from "@ui/body/json-parse-core";

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

describe("parseWithTruncation", () => {
  it("parses a complete body with truncated=false", () => {
    const r = parseWithTruncation('{"a":1,"b":[2,3]}');
    expect(r.truncated).toBe(false);
    expect(r.parsed).toEqual({ a: 1, b: [2, 3] });
  });

  it("recovers the valid prefix of a truncated object/array", () => {
    const r = parseWithTruncation('{"a":1,"b":[1,2,3');
    expect(r.truncated).toBe(true);
    expect(r.parsed).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it("recovers a truncated string value", () => {
    const r = parseWithTruncation('{"a":"hello wor');
    expect(r.truncated).toBe(true);
    expect(r.parsed).toEqual({ a: "hello wor" });
  });

  it("pretty-prints the recovered prefix", () => {
    const r = parseWithTruncation('{"a":1');
    expect(r.truncated).toBe(true);
    expect(JSON.parse(r.prettyText)).toEqual({ a: 1 });
  });

  it("throws when recovery yields only a primitive (not a confident tree)", () => {
    // A truncated top-level string recovers to a bare string — too weak to render
    // as a tree, so the caller falls through to the raw text view.
    expect(() => parseWithTruncation('"truncated str')).toThrow();
  });

  it("throws on non-JSON garbage so it falls through to text", () => {
    expect(() => parseWithTruncation("not json at all")).toThrow();
  });
});

describe("parseNdjson", () => {
  it("parses one document per non-blank line", () => {
    const r = parseNdjson('{"a":1}\n{"b":2}\n{"c":3}');
    expect(r.documents).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
    expect(r.truncatedDocIndex).toBeNull();
  });

  it("ignores blank lines and a trailing newline", () => {
    const r = parseNdjson('{"a":1}\n\n{"b":2}\n');
    expect(r.documents).toEqual([{ a: 1 }, { b: 2 }]);
    expect(r.truncatedDocIndex).toBeNull();
  });

  it("recovers a truncated final document and reports its index", () => {
    const r = parseNdjson('{"a":1}\n{"b":2}\n{"c":[1,2');
    expect(r.documents).toEqual([{ a: 1 }, { b: 2 }, { c: [1, 2] }]);
    expect(r.truncatedDocIndex).toBe(2);
  });

  it("returns no documents for an all-blank body", () => {
    const r = parseNdjson("\n\n  \n");
    expect(r.documents).toEqual([]);
    expect(r.truncatedDocIndex).toBeNull();
  });

  it("handles a single complete document", () => {
    const r = parseNdjson('{"only":true}');
    expect(r.documents).toEqual([{ only: true }]);
    expect(r.truncatedDocIndex).toBeNull();
  });
});
