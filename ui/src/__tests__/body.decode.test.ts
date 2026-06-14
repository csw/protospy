import { describe, it, expect, vi } from "vitest";
import type { BodyState } from "@ui/state/reducer";
import { decodeBody } from "@ui/body/decode";
import type { JsonParseResult } from "@ui/body/json-parse";
import {
  parseWithTruncation,
  parseNdjson as parseNdjsonCore,
} from "@ui/body/json-parse-core";
import {
  buildJsonTree,
  buildJsonForest,
  markTruncationPoint,
} from "@ui/components/json-tree/model";
import {
  computeDefaultExpanded,
  computeForestDefaultExpanded,
} from "@ui/components/json-tree/expand";
import { flattenTree, flattenForest } from "@ui/components/json-tree/flatten";

// Mock the Worker client so decodeBody's JSON/NDJSON steps run without a real
// Worker in the Node environment. The mock delegates to the same pure functions
// the Worker uses, exercising the real logic through the same interface.
vi.mock("@ui/body/json-parse", () => ({
  parseJson: (text: string): Promise<JsonParseResult> => {
    const { parsed, prettyText, truncated } = parseWithTruncation(text);
    const tree = buildJsonTree(parsed);
    const defaultExpanded = computeDefaultExpanded(tree);
    if (truncated) {
      for (const id of markTruncationPoint(tree).ancestorIds) {
        defaultExpanded.add(id);
      }
    }
    const rows = flattenTree(tree, defaultExpanded);
    return Promise.resolve({
      parsed,
      documents: null,
      prettyText,
      rows,
      defaultExpanded,
      truncated,
    });
  },
  parseNdjson: (text: string): Promise<JsonParseResult> => {
    const { documents, truncatedDocIndex } = parseNdjsonCore(text);
    if (documents.length === 0) {
      return Promise.reject(new SyntaxError("no NDJSON documents"));
    }
    const roots = buildJsonForest(documents);
    const defaultExpanded = computeForestDefaultExpanded(roots);
    if (truncatedDocIndex != null) {
      for (const id of markTruncationPoint(roots[truncatedDocIndex])
        .ancestorIds) {
        defaultExpanded.add(id);
      }
    }
    const rows = flattenForest(roots, defaultExpanded);
    const prettyText = documents
      .map((doc) => JSON.stringify(doc, null, 2))
      .join("\n\n");
    return Promise.resolve({
      parsed: null,
      documents,
      prettyText,
      rows,
      defaultExpanded,
      truncated: truncatedDocIndex != null,
    });
  },
}));

// Note: 'brotli-dec-wasm' is aliased to src/test/brotli-dec-wasm-node.ts in
// the Vitest node project config. That wrapper uses initSync() + readFileSync()
// to load the real WASM binary in Node, so these tests exercise the actual
// brotli-dec-wasm decompressor — not a mock. See vitest.config.ts for details.
//
// '@bokuweb/zstd-wasm' does NOT need a wrapper: its "node" exports condition
// points to a CJS entry that loads the WASM via require('fs/promises').readFile,
// which works in Vitest's node environment directly.

// Base64-encoded gzip of an Elasticsearch cluster info response
// from docs/examples/e1-response.json
const GZIP_ES_BASE64 =
  "H4sIAAAAAAAAAHyRMW+DMBSE9/wKxByQsYmN2TtUlbo0Q5sFGWyCVWMjbCeNovz3Ak6j0qGj391375183URRrFkv4qiMYgAxyCnBpCU03s5So7x1YqweFm6aTzEm9/na5L3kS052cE978LzbW3yAw7utOvaaHIP5JEYrjZ591+k9r/d9LcYFpClKs8U3zWsvFa9axU4mqFy0zCu31t1lCMeHy9Zix2wXmnGOsdjBmiHGAMFNm9MC4lzkGCHK65pk7dQ+tH7s5syFbDhpCYAJRHuISkRKVKS4yAmhFGaHNWQ1G2xn3Ay2TFlxj1S+EVpUv/rHGZj6wh+8l1r2vq/OchRVY/qBOVlLJd1lBRVpRlPwF5Kai69/KTBBU7nb8guOHZXUodyH8dGLNudt1JoxehNsbLp4c9t8AwAA//8DALf4578cAgAA";

// Base64-encoded fixture for the small payload {"hello":"world","n":42}
// (24 bytes UTF-8). Regenerate with Node:
//   const json = JSON.stringify({hello: "world", n: 42});
//   zlib.deflateSync(Buffer.from(json)).toString("base64");
const DEFLATE_JSON_BASE64 = "eJyrVspIzcnJV7JSKs8vyklR0lHKU7IyMaoFAGM1B3U=";

// UTF-8 BOM (EF BB BF) followed by `{"ok":true,"who":"world"}` (25 bytes
// of JSON, 28 bytes total). Regenerate with Node:
//   const json = JSON.stringify({ok: true, who: "world"});
//   Buffer.concat([Buffer.from([0xef,0xbb,0xbf]), Buffer.from(json)])
//     .toString("base64");
const BOM_JSON_BASE64 = "77u/eyJvayI6dHJ1ZSwid2hvIjoid29ybGQifQ==";

// Base64-encoded brotli of `{"hello":"world","n":42}` (24 bytes UTF-8).
// Regenerate with Node:
//   const json = JSON.stringify({hello: "world", n: 42});
//   zlib.brotliCompressSync(Buffer.from(json)).toString("base64");
const BROTLI_JSON_BASE64 = "iwuAeyJoZWxsbyI6IndvcmxkIiwibiI6NDJ9Aw==";

// Brotli-compressed "hello brotli world" plain text. Regenerate with Node:
//   zlib.brotliCompressSync(Buffer.from("hello brotli world")).toString("base64");
const BROTLI_TEXT_BASE64 = "iwiAaGVsbG8gYnJvdGxpIHdvcmxkAw==";

// Base64-encoded zstd of `{"hello":"world","n":42}` (24 bytes UTF-8).
// Regenerate with Node 22+:
//   const json = JSON.stringify({hello: "world", n: 42});
//   zlib.zstdCompressSync(Buffer.from(json)).toString("base64");
const ZSTD_JSON_BASE64 = "KLUv/SAYwQAAeyJoZWxsbyI6IndvcmxkIiwibiI6NDJ9";

// Zstd-compressed "hello zstd world" plain text (16 bytes UTF-8).
// Regenerate with Node 22+:
//   zlib.zstdCompressSync(Buffer.from("hello zstd world")).toString("base64");
const ZSTD_TEXT_BASE64 = "KLUv/SAQgQAAaGVsbG8genN0ZCB3b3JsZA==";

describe("decodeBody", () => {
  it("plain text body returns kind text with matching content", async () => {
    const body: BodyState = {
      chunks: [{ text: "hello world" }],
      atEnd: true,
      wireBytes: 11,
      contentType: "text/plain",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("text");
    expect(result.text).toBe("hello world");
    expect(result.mediaType).toBe("text/plain");
    expect(result.wireBytes).toBe(11);
    // No `Content-Encoding`, so no decompression step ran and
    // `decodedBytes` stays undefined — this is the signal the UI uses
    // to render a single size rather than the dual-size form.
    expect(result.decodedBytes).toBeUndefined();
  });

  it("JSON body returns kind json with pretty-printed text", async () => {
    const json = JSON.stringify({ foo: "bar", num: 42 });
    const body: BodyState = {
      chunks: [{ text: json }],
      atEnd: true,
      wireBytes: json.length,
      contentType: "application/json",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.mediaType).toBe("application/json");
    expect(result.wireBytes).toBe(json.length);
    // Should be pretty-printed
    const parsed = JSON.parse(result.text!) as Record<string, unknown>;
    expect(parsed.foo).toBe("bar");
    expect(parsed.num).toBe(42);
    // Verify indentation is present
    expect(result.text).toContain("\n");
  });

  it("invalid JSON body with JSON content-type falls back to text", async () => {
    const body: BodyState = {
      chunks: [{ text: "not valid json {" }],
      atEnd: true,
      wireBytes: 16,
      contentType: "application/json",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("text");
    expect(result.text).toBe("not valid json {");
    expect(result.mediaType).toBe("application/json");
  });

  it("gzip-encoded JSON body decompresses and pretty-prints", async () => {
    const body: BodyState = {
      chunks: [{ binary: GZIP_ES_BASE64 }],
      atEnd: true,
      wireBytes: 327,
      contentType: "application/json",
      contentEncoding: "gzip",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.mediaType).toBe("application/json");
    // `wireBytes` is the wire (compressed) byte count.
    expect(result.wireBytes).toBe(327);
    // `decodedBytes` is the post-decompression byte count — set only because
    // a decompression step ran. The decompressed Elasticsearch cluster
    // info response is 540 bytes of UTF-8 JSON.
    expect(result.decodedBytes).toBe(540);
    // The decompressed content is an Elasticsearch cluster info response
    expect(result.text).toContain("docker-cluster");
    expect(result.text).toContain("You Know, for Search");
  });

  it("binary content-type returns kind binary with no text", async () => {
    const body: BodyState = {
      chunks: [{ binary: "AAEC" }],
      atEnd: true,
      wireBytes: 3,
      contentType: "image/png",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("binary");
    expect(result.text).toBeUndefined();
    expect(result.mediaType).toBe("image/png");
    expect(result.wireBytes).toBe(3);
  });

  it("brotli-encoded JSON body decompresses and pretty-prints", async () => {
    // Fixture wire bytes: 28; decompresses to {"hello":"world","n":42}
    // (24 bytes).
    const body: BodyState = {
      chunks: [{ binary: BROTLI_JSON_BASE64 }],
      atEnd: true,
      wireBytes: 28,
      contentType: "application/json",
      contentEncoding: "br",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.mediaType).toBe("application/json");
    // `wireBytes` is the wire (compressed) byte count from BodyState.wireBytes.
    expect(result.wireBytes).toBe(28);
    // `decodedBytes` is the post-decompression byte count.
    expect(result.decodedBytes).toBe(24);
    const parsed = JSON.parse(result.text!) as Record<string, unknown>;
    expect(parsed.hello).toBe("world");
    expect(parsed.n).toBe(42);
  });

  it("brotli-encoded text body decompresses to plain text", async () => {
    // Fixture wire bytes: 22; decompresses to "hello brotli world"
    // (18 bytes).
    const body: BodyState = {
      chunks: [{ binary: BROTLI_TEXT_BASE64 }],
      atEnd: true,
      wireBytes: 22,
      contentType: "text/plain",
      contentEncoding: "br",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("text");
    expect(result.text).toBe("hello brotli world");
    expect(result.mediaType).toBe("text/plain");
    expect(result.wireBytes).toBe(22);
    expect(result.decodedBytes).toBe(18);
  });

  it("corrupt brotli bytes cause decodeBody to reject", async () => {
    // "AAEC" is valid base64 but not valid brotli-compressed data.
    // The decompressor (mocked with Node's zlib.brotliDecompressSync) throws,
    // and decodeBody should propagate the rejection.
    const body: BodyState = {
      chunks: [{ binary: "AAEC" }],
      atEnd: true,
      wireBytes: 3,
      contentType: "text/plain",
      contentEncoding: "br",
    };
    await expect(decodeBody(body)).rejects.toThrow();
  });

  it("zstd-encoded JSON body decompresses and pretty-prints", async () => {
    // Fixture wire bytes: 33; decompresses to {"hello":"world","n":42}
    // (24 bytes). For this small payload zstd's frame header makes the
    // compressed form larger than the input — fine; we're verifying
    // round-trip semantics, not compression ratio.
    const body: BodyState = {
      chunks: [{ binary: ZSTD_JSON_BASE64 }],
      atEnd: true,
      wireBytes: 33,
      contentType: "application/json",
      contentEncoding: "zstd",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.mediaType).toBe("application/json");
    expect(result.wireBytes).toBe(33);
    expect(result.decodedBytes).toBe(24);
    const parsed = JSON.parse(result.text!) as Record<string, unknown>;
    expect(parsed.hello).toBe("world");
    expect(parsed.n).toBe(42);
  });

  it("zstd-encoded text body decompresses to plain text", async () => {
    // Fixture wire bytes: 25; decompresses to "hello zstd world" (16 bytes).
    const body: BodyState = {
      chunks: [{ binary: ZSTD_TEXT_BASE64 }],
      atEnd: true,
      wireBytes: 25,
      contentType: "text/plain",
      contentEncoding: "zstd",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("text");
    expect(result.text).toBe("hello zstd world");
    expect(result.mediaType).toBe("text/plain");
    expect(result.wireBytes).toBe(25);
    expect(result.decodedBytes).toBe(16);
  });

  it("corrupt zstd bytes cause decodeBody to reject", async () => {
    // "AAEC" is valid base64 but not valid zstd-compressed data.
    const body: BodyState = {
      chunks: [{ binary: "AAEC" }],
      atEnd: true,
      wireBytes: 3,
      contentType: "text/plain",
      contentEncoding: "zstd",
    };
    await expect(decodeBody(body)).rejects.toThrow();
  });

  it("multiple text chunks are concatenated", async () => {
    const body: BodyState = {
      chunks: [{ text: "hello " }, { text: "world" }],
      atEnd: true,
      wireBytes: 11,
      contentType: "text/plain",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("text");
    expect(result.text).toBe("hello world");
  });

  it("body with no content-type uses application/octet-stream as mediaType", async () => {
    const body: BodyState = {
      chunks: [{ text: "some data" }],
      atEnd: true,
      wireBytes: 9,
    };
    const result = await decodeBody(body);
    expect(result.mediaType).toBe("application/octet-stream");
  });
});

describe("decodeBody NDJSON", () => {
  it("application/vnd.elasticsearch+x-ndjson returns kind ndjson with documents", async () => {
    const line1 = JSON.stringify({ index: { _id: "1" } });
    const line2 = JSON.stringify({ title: "Inception" });
    const ndjsonText = `${line1}\n${line2}`;
    const body: BodyState = {
      chunks: [{ text: ndjsonText }],
      atEnd: true,
      wireBytes: ndjsonText.length,
      contentType: "application/vnd.elasticsearch+x-ndjson",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("ndjson");
    expect(result.mediaType).toBe("application/vnd.elasticsearch+x-ndjson");
    expect(result.documents).toEqual([
      { index: { _id: "1" } },
      { title: "Inception" },
    ]);
    // Pre-built forest rows accompany the documents for the initial render.
    expect(result.initialRows?.length).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);
  });

  it("vnd.elasticsearch+x-ndjson with compatible-with param returns kind ndjson", async () => {
    const line = JSON.stringify({ query: { match_all: {} } });
    const body: BodyState = {
      chunks: [{ text: line }],
      atEnd: true,
      wireBytes: line.length,
      contentType: "application/vnd.elasticsearch+x-ndjson; compatible-with=9",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("ndjson");
    expect(result.mediaType).toBe(
      "application/vnd.elasticsearch+x-ndjson; compatible-with=9",
    );
  });

  it("application/x-ndjson returns kind ndjson", async () => {
    const lines = [JSON.stringify({ a: 1 }), JSON.stringify({ b: 2 })].join(
      "\n",
    );
    const body: BodyState = {
      chunks: [{ text: lines }],
      atEnd: true,
      wireBytes: lines.length,
      contentType: "application/x-ndjson",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("ndjson");
    expect(result.documents).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("application/ndjson returns kind ndjson", async () => {
    const line = JSON.stringify({ ok: true });
    const body: BodyState = {
      chunks: [{ text: line }],
      atEnd: true,
      wireBytes: line.length,
      contentType: "application/ndjson",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("ndjson");
    expect(result.documents).toEqual([{ ok: true }]);
  });

  it("provides a blank-line-separated pretty text for copy", async () => {
    const r1 = JSON.stringify({ id: 1 });
    const r2 = JSON.stringify({ id: 2 });
    const body: BodyState = {
      chunks: [{ text: `${r1}\n${r2}` }],
      atEnd: true,
      wireBytes: r1.length + r2.length + 1,
      contentType: "application/x-ndjson",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("ndjson");
    expect(result.text).toBe('{\n  "id": 1\n}\n\n{\n  "id": 2\n}');
  });

  it("skips empty lines such as a trailing newline", async () => {
    const line = JSON.stringify({ a: 1 });
    const body: BodyState = {
      chunks: [{ text: `${line}\n` }],
      atEnd: true,
      wireBytes: line.length + 1,
      contentType: "application/x-ndjson",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("ndjson");
    expect(result.documents).toEqual([{ a: 1 }]);
  });

  it("recovers a truncated final document and flags truncation", async () => {
    const valid = JSON.stringify({ ok: true });
    const truncatedLine = '{"hits":[1,2,3';
    const text = `${valid}\n${truncatedLine}`;
    const body: BodyState = {
      chunks: [{ text }],
      atEnd: true,
      wireBytes: text.length,
      contentType: "application/x-ndjson",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("ndjson");
    expect(result.truncated).toBe(true);
    expect(result.documents).toEqual([{ ok: true }, { hits: [1, 2, 3] }]);
  });

  it("falls back to text when no NDJSON documents can be parsed", async () => {
    const text = "\n   \n";
    const body: BodyState = {
      chunks: [{ text }],
      atEnd: true,
      wireBytes: text.length,
      contentType: "application/x-ndjson",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("text");
  });
});

describe("decodeBody truncated JSON", () => {
  it("recovers the valid prefix of a truncated JSON body and flags it", async () => {
    const text = '{"took":5,"hits":{"hits":[{"_id":"1"}';
    const body: BodyState = {
      chunks: [{ text }],
      atEnd: true,
      wireBytes: text.length,
      contentType: "application/json",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.truncated).toBe(true);
    expect(result.parsed).toEqual({
      took: 5,
      hits: { hits: [{ _id: "1" }] },
    });
  });

  it("does not flag a complete JSON body as truncated", async () => {
    const text = JSON.stringify({ ok: true });
    const body: BodyState = {
      chunks: [{ text }],
      atEnd: true,
      wireBytes: text.length,
      contentType: "application/json",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.truncated).toBe(false);
  });
});

describe("decodeBody edge cases", () => {
  it("deflate-encoded JSON body decompresses and pretty-prints", async () => {
    // Fixture wire bytes: 32; decompresses to {"hello":"world","n":42}
    // (24 bytes).
    const body: BodyState = {
      chunks: [{ binary: DEFLATE_JSON_BASE64 }],
      atEnd: true,
      wireBytes: 32,
      contentType: "application/json",
      contentEncoding: "deflate",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.mediaType).toBe("application/json");
    expect(result.wireBytes).toBe(32);
    expect(result.decodedBytes).toBe(24);
    const parsed = JSON.parse(result.text!) as Record<string, unknown>;
    expect(parsed.hello).toBe("world");
    expect(parsed.n).toBe(42);
  });

  it("Content-Type with charset parameter still detects JSON and reports the full header", async () => {
    const json = JSON.stringify({ foo: "bar" });
    const body: BodyState = {
      chunks: [{ text: json }],
      atEnd: true,
      wireBytes: json.length,
      contentType: "application/json; charset=utf-8",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    // mediaType currently reflects the full Content-Type header verbatim;
    // pin that behavior. Higher-level UI is responsible for stripping
    // params before display.
    expect(result.mediaType).toBe("application/json; charset=utf-8");
  });

  it("UTF-8 BOM at the start of a JSON body is stripped before parsing", async () => {
    // Provide the body as binary base64 so that the raw UTF-8 BOM bytes
    // (EF BB BF) survive into TextDecoder, which is responsible for
    // stripping them. Fixture decodes to BOM + `{"ok":true,"who":"world"}`.
    const body: BodyState = {
      chunks: [{ binary: BOM_JSON_BASE64 }],
      atEnd: true,
      wireBytes: 28,
      contentType: "application/json",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    const parsed = JSON.parse(result.text!) as Record<string, unknown>;
    expect(parsed.ok).toBe(true);
    expect(parsed.who).toBe("world");
  });

  it("empty body does not crash and returns a sensible result", async () => {
    const body: BodyState = {
      chunks: [],
      atEnd: true,
      wireBytes: 0,
      contentType: "text/plain",
    };
    const result = await decodeBody(body);
    expect(result.wireBytes).toBe(0);
    expect(result.mediaType).toBe("text/plain");
    // Default branch returns kind: "text" with an empty string.
    expect(result.kind).toBe("text");
    expect(result.text).toBe("");
  });

  it("malformed base64 in payload.bytes causes decodeBody to reject", async () => {
    const body: BodyState = {
      chunks: [{ binary: "!!!not-valid-base64!!!" }],
      atEnd: true,
      wireBytes: 0,
      contentType: "application/octet-stream",
    };
    await expect(decodeBody(body)).rejects.toThrow();
  });

  it("Content-Type with multiple parameters still detects JSON", async () => {
    const json = JSON.stringify({ id: 1 });
    const body: BodyState = {
      chunks: [{ text: json }],
      atEnd: true,
      wireBytes: json.length,
      contentType: "application/json; charset=utf-8; boundary=---xyz",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.mediaType).toBe(
      "application/json; charset=utf-8; boundary=---xyz",
    );
    const parsed = JSON.parse(result.text!) as Record<string, unknown>;
    expect(parsed.id).toBe(1);
  });
});

// rawText (the un-pretty decoded source) and bytes (the decompressed bytes)
// back the raw/hex view modes (PRO-336); both are always present.
describe("decodeBody raw/hex fields", () => {
  it("json: rawText is the original un-pretty source, bytes are the decoded bytes", async () => {
    const json = '{"hello":"world","n":42}';
    const body: BodyState = {
      chunks: [{ text: json }],
      atEnd: true,
      wireBytes: json.length,
      contentType: "application/json",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    // Pretty text is multi-line; rawText is the compact original.
    expect(result.text).toContain("\n");
    expect(result.rawText).toBe(json);
    expect(result.rawText).not.toContain("\n");
    expect(new TextDecoder().decode(result.bytes)).toBe(json);
  });

  it("text: rawText equals text and bytes round-trip", async () => {
    const body: BodyState = {
      chunks: [{ text: "hello world" }],
      atEnd: true,
      wireBytes: 11,
      contentType: "text/plain",
    };
    const result = await decodeBody(body);
    expect(result.rawText).toBe("hello world");
    expect(result.rawText).toBe(result.text);
    expect(Array.from(result.bytes)).toEqual(
      Array.from(new TextEncoder().encode("hello world")),
    );
  });

  it("binary: bytes carry the decoded bytes even though text is absent", async () => {
    const body: BodyState = {
      chunks: [{ binary: "AAEC" }], // 0x00 0x01 0x02
      atEnd: true,
      wireBytes: 3,
      contentType: "image/png",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("binary");
    expect(result.text).toBeUndefined();
    expect(Array.from(result.bytes)).toEqual([0x00, 0x01, 0x02]);
    // rawText is always a string (the bytes decoded as UTF-8).
    expect(typeof result.rawText).toBe("string");
  });

  it("bytes are the decompressed bytes for a compressed body", async () => {
    const body: BodyState = {
      chunks: [{ binary: DEFLATE_JSON_BASE64 }],
      atEnd: true,
      wireBytes: 32,
      contentType: "application/json",
      contentEncoding: "deflate",
    };
    const result = await decodeBody(body);
    // The decompressed JSON, not the compressed wire bytes.
    expect(new TextDecoder().decode(result.bytes)).toBe(
      '{"hello":"world","n":42}',
    );
    expect(result.bytes.length).toBe(24);
  });
});

// Verify the parse → transfer → tree-construction round-trip at the decode
// layer. The Worker boundary is mocked (see vi.mock above), so these tests run
// in Node. The real Worker code path (including structured-clone transfer) is
// exercised by the browser tests in browser/body-json-worker.spec.ts.
describe("decodeBody JSON Worker round-trip", () => {
  it("parsed value is the exact JS object JSON.parse returns", async () => {
    const input = '{"id":1,"tags":["a","b"],"active":true}';
    const body: BodyState = {
      chunks: [{ text: input }],
      atEnd: true,
      wireBytes: input.length,
      contentType: "application/json",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.parsed).toEqual({ id: 1, tags: ["a", "b"], active: true });
  });

  it("prettyText (result.text) is 2-space indented JSON", async () => {
    const input = '{"x":1}';
    const body: BodyState = {
      chunks: [{ text: input }],
      atEnd: true,
      wireBytes: input.length,
      contentType: "application/json",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.text).toBe('{\n  "x": 1\n}');
  });

  it("invalid JSON falls through to kind: text after the Worker rejects", async () => {
    const input = "not json {{{";
    const body: BodyState = {
      chunks: [{ text: input }],
      atEnd: true,
      wireBytes: input.length,
      contentType: "application/json",
    };
    const result = await decodeBody(body);
    // Should fall through to plain text, not throw.
    expect(result.kind).toBe("text");
    expect(result.text).toBe(input);
  });

  it("parsed object can be passed to buildJsonTree without error", async () => {
    const input = JSON.stringify({ hits: [{ _id: "1", score: 0.9 }] });
    const body: BodyState = {
      chunks: [{ text: input }],
      atEnd: true,
      wireBytes: input.length,
      contentType: "application/json",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    // Tree construction must not throw for structured-clone-compatible values.
    const tree = buildJsonTree(result.parsed!);
    expect(tree).toBeDefined();
    expect(tree.children).toBeDefined();
  });

  it("initialRows and initialExpanded are populated for JSON bodies", async () => {
    const input = JSON.stringify({ x: 1, y: [2, 3] });
    const body: BodyState = {
      chunks: [{ text: input }],
      atEnd: true,
      wireBytes: input.length,
      contentType: "application/json",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.initialRows).toBeDefined();
    expect(Array.isArray(result.initialRows)).toBe(true);
    expect(result.initialRows!.length).toBeGreaterThan(0);
    expect(result.initialExpanded).toBeDefined();
    expect(result.initialExpanded).toBeInstanceOf(Set);
  });
});
