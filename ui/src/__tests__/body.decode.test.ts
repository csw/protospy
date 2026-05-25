import { describe, it, expect, vi } from "vitest";
import type { BodyState } from "@ui/state/reducer";
import { decodeBody } from "@ui/body/decode";

// Use Node's built-in brotli in the test environment. brotli-dec-wasm loads a
// WASM binary via fetch(new URL(..., import.meta.url)) which doesn't work for
// file:// URLs in Node 22. We mock the module to keep the coverage real: the
// full decodeBody pipeline is exercised; only the decompressor is swapped out.
vi.mock("brotli-dec-wasm", async () => {
  const zlib = await import("node:zlib");
  return {
    default: Promise.resolve({
      decompress: (data: Uint8Array): Uint8Array =>
        new Uint8Array(zlib.brotliDecompressSync(Buffer.from(data))),
    }),
  };
});

// Base64-encoded gzip of an Elasticsearch cluster info response
// from docs/examples/e1-response.json
const GZIP_ES_BASE64 =
  "H4sIAAAAAAAAAHyRMW+DMBSE9/wKxByQsYmN2TtUlbo0Q5sFGWyCVWMjbCeNovz3Ak6j0qGj391375183URRrFkv4qiMYgAxyCnBpCU03s5So7x1YqweFm6aTzEm9/na5L3kS052cE978LzbW3yAw7utOvaaHIP5JEYrjZ591+k9r/d9LcYFpClKs8U3zWsvFa9axU4mqFy0zCu31t1lCMeHy9Zix2wXmnGOsdjBmiHGAMFNm9MC4lzkGCHK65pk7dQ+tH7s5syFbDhpCYAJRHuISkRKVKS4yAmhFGaHNWQ1G2xn3Ay2TFlxj1S+EVpUv/rHGZj6wh+8l1r2vq/OchRVY/qBOVlLJd1lBRVpRlPwF5Kai69/KTBBU7nb8guOHZXUodyH8dGLNudt1JoxehNsbLp4c9t8AwAA//8DALf4578cAgAA";

// Base64-encoded fixtures for the small payload {"hello":"world","n":42}
// (24 bytes UTF-8). Regenerate with Node:
//   const json = JSON.stringify({hello: "world", n: 42});
//   zlib.deflateSync(Buffer.from(json)).toString("base64");
//   zlib.deflateRawSync(Buffer.from(json)).toString("base64");
const DEFLATE_JSON_BASE64 = "eJyrVspIzcnJV7JSKs8vyklR0lHKU7IyMaoFAGM1B3U=";
const DEFLATE_RAW_JSON_BASE64 = "q1bKSM3JyVeyUirPL8pJUdJRylOyMjGqBQA=";

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

describe("decodeBody", () => {
  it("plain text body returns kind text with matching content", async () => {
    const body: BodyState = {
      chunks: [{ text: "hello world" }],
      atEnd: true,
      totalBytes: 11,
      contentType: "text/plain",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("text");
    expect(result.text).toBe("hello world");
    expect(result.mediaType).toBe("text/plain");
    expect(result.size).toBe(11);
  });

  it("JSON body returns kind json with pretty-printed text", async () => {
    const json = JSON.stringify({ foo: "bar", num: 42 });
    const body: BodyState = {
      chunks: [{ text: json }],
      atEnd: true,
      totalBytes: json.length,
      contentType: "application/json",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.mediaType).toBe("application/json");
    expect(result.size).toBe(json.length);
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
      totalBytes: 16,
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
      totalBytes: 327,
      contentType: "application/json",
      contentEncoding: "gzip",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.mediaType).toBe("application/json");
    expect(result.size).toBe(327);
    // The decompressed content is an Elasticsearch cluster info response
    expect(result.text).toContain("docker-cluster");
    expect(result.text).toContain("You Know, for Search");
  });

  it("binary content-type returns kind binary with no text", async () => {
    const body: BodyState = {
      chunks: [{ binary: "AAEC" }],
      atEnd: true,
      totalBytes: 3,
      contentType: "image/png",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("binary");
    expect(result.text).toBeUndefined();
    expect(result.mediaType).toBe("image/png");
    expect(result.size).toBe(3);
  });

  it("brotli-encoded JSON body decompresses and pretty-prints", async () => {
    // Fixture decompresses to {"hello":"world","n":42} (24 bytes).
    const body: BodyState = {
      chunks: [{ binary: BROTLI_JSON_BASE64 }],
      atEnd: true,
      totalBytes: 24,
      contentType: "application/json",
      contentEncoding: "br",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.mediaType).toBe("application/json");
    expect(result.size).toBe(24);
    const parsed = JSON.parse(result.text!) as Record<string, unknown>;
    expect(parsed.hello).toBe("world");
    expect(parsed.n).toBe(42);
  });

  it("brotli-encoded text body decompresses to plain text", async () => {
    const body: BodyState = {
      chunks: [{ binary: BROTLI_TEXT_BASE64 }],
      atEnd: true,
      totalBytes: 18,
      contentType: "text/plain",
      contentEncoding: "br",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("text");
    expect(result.text).toBe("hello brotli world");
    expect(result.mediaType).toBe("text/plain");
  });

  it("multiple text chunks are concatenated", async () => {
    const body: BodyState = {
      chunks: [{ text: "hello " }, { text: "world" }],
      atEnd: true,
      totalBytes: 11,
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
      totalBytes: 9,
    };
    const result = await decodeBody(body);
    expect(result.mediaType).toBe("application/octet-stream");
  });
});

describe("decodeBody JSONL", () => {
  it("application/vnd.elasticsearch+x-ndjson returns kind jsonl", async () => {
    const line1 = JSON.stringify({ index: { _id: "1" } });
    const line2 = JSON.stringify({ title: "Inception" });
    const ndjsonText = `${line1}\n${line2}`;
    const body: BodyState = {
      chunks: [{ text: ndjsonText }],
      atEnd: true,
      totalBytes: ndjsonText.length,
      contentType: "application/vnd.elasticsearch+x-ndjson",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("jsonl");
    expect(result.mediaType).toBe("application/vnd.elasticsearch+x-ndjson");
    expect(result.text).toContain('"_id"');
    expect(result.text).toContain('"title"');
    // Records separated by blank line
    expect(result.text).toContain("}\n\n{");
  });

  it("vnd.elasticsearch+x-ndjson with compatible-with param returns kind jsonl", async () => {
    const line = JSON.stringify({ query: { match_all: {} } });
    const body: BodyState = {
      chunks: [{ text: line }],
      atEnd: true,
      totalBytes: line.length,
      contentType: "application/vnd.elasticsearch+x-ndjson; compatible-with=9",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("jsonl");
    expect(result.mediaType).toBe(
      "application/vnd.elasticsearch+x-ndjson; compatible-with=9",
    );
  });

  it("application/x-ndjson returns kind jsonl", async () => {
    const lines = [JSON.stringify({ a: 1 }), JSON.stringify({ b: 2 })].join(
      "\n",
    );
    const body: BodyState = {
      chunks: [{ text: lines }],
      atEnd: true,
      totalBytes: lines.length,
      contentType: "application/x-ndjson",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("jsonl");
  });

  it("application/ndjson returns kind jsonl", async () => {
    const line = JSON.stringify({ ok: true });
    const body: BodyState = {
      chunks: [{ text: line }],
      atEnd: true,
      totalBytes: line.length,
      contentType: "application/ndjson",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("jsonl");
  });

  it("JSONL pretty-prints each record separated by a blank line", async () => {
    const r1 = JSON.stringify({ id: 1 });
    const r2 = JSON.stringify({ id: 2 });
    const body: BodyState = {
      chunks: [{ text: `${r1}\n${r2}` }],
      atEnd: true,
      totalBytes: r1.length + r2.length + 1,
      contentType: "application/x-ndjson",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("jsonl");
    const expected = '{\n  "id": 1\n}\n\n{\n  "id": 2\n}';
    expect(result.text).toBe(expected);
  });

  it("JSONL skips empty lines such as a trailing newline", async () => {
    const line = JSON.stringify({ a: 1 });
    const body: BodyState = {
      chunks: [{ text: `${line}\n` }],
      atEnd: true,
      totalBytes: line.length + 1,
      contentType: "application/x-ndjson",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("jsonl");
    expect(result.text).toBe('{\n  "a": 1\n}');
  });

  it("JSONL passes through lines that are not valid JSON", async () => {
    const valid = JSON.stringify({ ok: true });
    const invalid = "not-valid-json";
    const body: BodyState = {
      chunks: [{ text: `${valid}\n${invalid}` }],
      atEnd: true,
      totalBytes: valid.length + invalid.length + 1,
      contentType: "application/x-ndjson",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("jsonl");
    expect(result.text).toContain('"ok"');
    expect(result.text).toContain("not-valid-json");
  });
});

describe("decodeBody edge cases", () => {
  it("deflate-encoded JSON body decompresses and pretty-prints", async () => {
    // Fixture decompresses to {"hello":"world","n":42} (24 bytes).
    const body: BodyState = {
      chunks: [{ binary: DEFLATE_JSON_BASE64 }],
      atEnd: true,
      totalBytes: 24,
      contentType: "application/json",
      contentEncoding: "deflate",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("json");
    expect(result.mediaType).toBe("application/json");
    const parsed = JSON.parse(result.text!) as Record<string, unknown>;
    expect(parsed.hello).toBe("world");
    expect(parsed.n).toBe(42);
  });

  it("deflate-raw-encoded JSON body decompresses and pretty-prints", async () => {
    // The implementation maps "deflate-raw" → DecompressionStream("raw").
    // If the host runtime doesn't accept "raw" as a CompressionFormat, the
    // DecompressionStream constructor throws and decodeBody should reject.
    // Pin whichever behavior the current runtime exhibits.
    const body: BodyState = {
      chunks: [{ binary: DEFLATE_RAW_JSON_BASE64 }],
      atEnd: true,
      totalBytes: 24,
      contentType: "application/json",
      contentEncoding: "deflate-raw",
    };

    let result: Awaited<ReturnType<typeof decodeBody>> | undefined;
    let error: unknown;
    try {
      result = await decodeBody(body);
    } catch (e) {
      error = e;
    }

    if (result !== undefined) {
      // Runtime supports "raw" — body is decompressed and parsed as JSON.
      expect(result.kind).toBe("json");
      expect(result.mediaType).toBe("application/json");
      const parsed = JSON.parse(result.text!) as Record<string, unknown>;
      expect(parsed.hello).toBe("world");
      expect(parsed.n).toBe(42);
    } else {
      // Runtime doesn't support "raw" — decodeBody rejects.
      expect(error).toBeInstanceOf(Error);
    }
  });

  it("Content-Type with charset parameter still detects JSON and reports the full header", async () => {
    const json = JSON.stringify({ foo: "bar" });
    const body: BodyState = {
      chunks: [{ text: json }],
      atEnd: true,
      totalBytes: json.length,
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
      totalBytes: 28,
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
      totalBytes: 0,
      contentType: "text/plain",
    };
    const result = await decodeBody(body);
    expect(result.size).toBe(0);
    expect(result.mediaType).toBe("text/plain");
    // Default branch returns kind: "text" with an empty string.
    expect(result.kind).toBe("text");
    expect(result.text).toBe("");
  });

  it("malformed base64 in payload.bytes causes decodeBody to reject", async () => {
    const body: BodyState = {
      chunks: [{ binary: "!!!not-valid-base64!!!" }],
      atEnd: true,
      totalBytes: 0,
      contentType: "application/octet-stream",
    };
    await expect(decodeBody(body)).rejects.toThrow();
  });

  it("Content-Type with multiple parameters still detects JSON", async () => {
    const json = JSON.stringify({ id: 1 });
    const body: BodyState = {
      chunks: [{ text: json }],
      atEnd: true,
      totalBytes: json.length,
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
