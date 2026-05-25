import type { BodyState } from "@ui/state/reducer";
import type { BodyChunk } from "@bindings/BodyChunk";

export interface DecodeResult {
  kind: "json" | "jsonl" | "text" | "binary";
  text?: string;
  mediaType: string;
  size: number;
}

function chunkToBytes(chunk: BodyChunk): Uint8Array {
  if ("text" in chunk) {
    return new TextEncoder().encode(chunk.text);
  } else {
    // base64 decode
    const raw = atob(chunk.binary);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
  }
}

function concatenate(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.byteLength;
  }
  return result;
}

// Lazy singleton for the brotli WASM decompressor. Loaded on first use so
// the WASM binary doesn't affect startup time. The `brotli-dec-wasm` default
// export is itself a Promise that resolves once the WASM module is ready.
let _brotliDecompress: ((data: Uint8Array) => Uint8Array) | null = null;

async function getBrotliDecompress(): Promise<
  (data: Uint8Array) => Uint8Array
> {
  if (_brotliDecompress) return _brotliDecompress;
  const mod = await import("brotli-dec-wasm");
  const brotli = await mod.default;
  _brotliDecompress = (data: Uint8Array) => brotli.decompress(data);
  return _brotliDecompress;
}

async function decompress(
  data: Uint8Array,
  encoding: string,
): Promise<Uint8Array> {
  if (encoding === "br") {
    const brotliDecompress = await getBrotliDecompress();
    return brotliDecompress(data);
  }

  let format: string;
  if (encoding === "gzip") format = "gzip";
  else if (encoding === "deflate") format = "deflate";
  else if (encoding === "deflate-raw") format = "raw";
  else throw new Error(`unsupported encoding: ${encoding}`);

  const ds = new DecompressionStream(format as CompressionFormat);
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  // Ensure data has a concrete ArrayBuffer (not SharedArrayBuffer) for the writer
  writer.write(new Uint8Array(data));
  writer.close();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return concatenate(chunks);
}

const JSONL_TYPES = new Set([
  "application/vnd.elasticsearch+x-ndjson",
  "application/x-ndjson",
  "application/ndjson",
]);

function isJsonlContentType(contentType: string): boolean {
  const base = contentType.split(";")[0].trim().toLowerCase();
  return JSONL_TYPES.has(base);
}

function formatJsonl(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const formatted = lines.map((line) => {
    try {
      return JSON.stringify(JSON.parse(line) as unknown, null, 2);
    } catch {
      return line;
    }
  });
  return formatted.join("\n\n");
}

export async function decodeBody(body: BodyState): Promise<DecodeResult> {
  const { chunks, totalBytes, contentType, contentEncoding } = body;
  const mediaType = contentType ?? "application/octet-stream";

  // Step 1: Concatenate chunks into bytes
  const byteArrays = chunks.map(chunkToBytes);
  let bytes = concatenate(byteArrays);

  // Step 2: Decompress if needed
  const encoding = contentEncoding?.toLowerCase();
  if (
    encoding === "br" ||
    encoding === "gzip" ||
    encoding === "deflate" ||
    encoding === "deflate-raw"
  ) {
    bytes = await decompress(bytes, encoding);
  }

  // Step 3: Decode bytes to text
  const text = new TextDecoder().decode(bytes);

  // Step 4: Detect JSONL — must precede generic JSON check because ndjson
  // MIME types contain the substring "json" and would otherwise be mishandled
  if (contentType != null && isJsonlContentType(contentType)) {
    return {
      kind: "jsonl",
      text: formatJsonl(text),
      mediaType,
      size: totalBytes,
    };
  }

  // Step 5: Detect JSON
  if (contentType?.toLowerCase().includes("json")) {
    try {
      const parsed: unknown = JSON.parse(text);
      const prettyText = JSON.stringify(parsed, null, 2);
      return { kind: "json", text: prettyText, mediaType, size: totalBytes };
    } catch {
      // fall through to plain text
    }
  }

  // Step 6: Detect binary content types
  const binaryPrefixes = [
    "image/",
    "audio/",
    "video/",
    "application/octet-stream",
  ];
  if (binaryPrefixes.some((prefix) => contentType?.startsWith(prefix))) {
    return { kind: "binary", mediaType, size: totalBytes };
  }

  // Step 7: Default to text
  return { kind: "text", text, mediaType, size: totalBytes };
}
