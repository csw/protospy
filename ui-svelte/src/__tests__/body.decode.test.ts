import { describe, it, expect } from "vitest";
import type { BodyState } from "@ui/state/reducer";
import { decodeBody } from "@ui/body/decode";

// Base64-encoded gzip of an Elasticsearch cluster info response
// from docs/examples/e1-response.json
const GZIP_ES_BASE64 =
  "H4sIAAAAAAAAAHyRMW+DMBSE9/wKxByQsYmN2TtUlbo0Q5sFGWyCVWMjbCeNovz3Ak6j0qGj391375183URRrFkv4qiMYgAxyCnBpCU03s5So7x1YqweFm6aTzEm9/na5L3kS052cE978LzbW3yAw7utOvaaHIP5JEYrjZ591+k9r/d9LcYFpClKs8U3zWsvFa9axU4mqFy0zCu31t1lCMeHy9Zix2wXmnGOsdjBmiHGAMFNm9MC4lzkGCHK65pk7dQ+tH7s5syFbDhpCYAJRHuISkRKVKS4yAmhFGaHNWQ1G2xn3Ay2TFlxj1S+EVpUv/rHGZj6wh+8l1r2vq/OchRVY/qBOVlLJd1lBRVpRlPwF5Kai69/KTBBU7nb8guOHZXUodyH8dGLNudt1JoxehNsbLp4c9t8AwAA//8DALf4578cAgAA";

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

  it("brotli encoding returns text indicating not decompressed", async () => {
    const body: BodyState = {
      chunks: [{ binary: "AAEC" }],
      atEnd: true,
      totalBytes: 3,
      contentType: "text/html",
      contentEncoding: "br",
    };
    const result = await decodeBody(body);
    expect(result.kind).toBe("text");
    expect(result.text).toContain("brotli");
    expect(result.text).toContain("not decompressed");
    expect(result.mediaType).toBe("text/html");
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
