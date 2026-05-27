import type { BodyState } from "@ui/state/reducer";
import type { BodyChunk } from "@bindings/BodyChunk";

export interface DecodeResult {
  kind: "json" | "jsonl" | "text" | "binary";
  text?: string;
  mediaType: string;
  /**
   * Wire byte count, passed through from `BodyState.wireBytes` unchanged.
   * For uncompressed bodies this equals the decoded byte count; for
   * compressed bodies (`Content-Encoding: gzip | deflate | br | zstd`) it
   * is the compressed size on the wire. The post-decompression byte count
   * is reported separately as `decodedBytes`.
   */
  wireBytes: number;
  /**
   * Decompressed byte count. Set only when a decompression step ran (i.e.
   * the body had a recognized `Content-Encoding`); `undefined` for
   * uncompressed bodies. The UI uses the presence of this field to render
   * a dual-size display ("wire → decoded") rather than just `wireBytes`.
   */
  decodedBytes?: number;
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

// Lazy singleton for the zstd WASM decompressor (@bokuweb/zstd-wasm).
// Loaded on first use so the 248 KB WASM binary doesn't affect startup time.
//
// In Vitest's node project the package resolves via its "node" condition to a
// CJS entry that uses `require('fs/promises').readFile` — no wrapper needed.
// In the browser (Vite build / Playwright tests) the "browser" condition entry
// is used, which loads the WASM via `new URL('./zstd.wasm', import.meta.url)`.
// Browser tests therefore exercise the actual browser WASM code path and are
// the primary parity check between test and production environments.
let _zstdDecompress: ((data: Uint8Array) => Uint8Array) | null = null;

async function getZstdDecompress(): Promise<(data: Uint8Array) => Uint8Array> {
  if (_zstdDecompress) return _zstdDecompress;
  const { init, decompress } = await import("@bokuweb/zstd-wasm");
  await init();
  // Assign decompress directly (not wrapped in a lambda) because
  // @bokuweb/zstd-wasm exports it as a plain free function, so no
  // `this` binding is needed. The brotli equivalent uses a lambda
  // because brotli.decompress() is a WASM-object method that needs
  // brotli as its receiver.
  _zstdDecompress = decompress;
  return _zstdDecompress;
}

async function decompress(
  data: Uint8Array,
  encoding: string,
): Promise<Uint8Array> {
  if (encoding === "br") {
    const brotliDecompress = await getBrotliDecompress();
    return brotliDecompress(data);
  }

  if (encoding === "zstd") {
    const zstdDecompress = await getZstdDecompress();
    return zstdDecompress(data);
  }

  let format: string;
  if (encoding === "gzip") format = "gzip";
  else if (encoding === "deflate") format = "deflate";
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
  const { chunks, wireBytes, contentType, contentEncoding } = body;
  const mediaType = contentType ?? "application/octet-stream";

  // Step 1: Concatenate chunks into bytes
  const byteArrays = chunks.map(chunkToBytes);
  let bytes = concatenate(byteArrays);

  // Step 2: Decompress if needed. See `DecodeResult.decodedBytes`.
  const encoding = contentEncoding?.toLowerCase();
  let decodedBytes: number | undefined;
  if (
    encoding === "br" ||
    encoding === "gzip" ||
    encoding === "deflate" ||
    encoding === "zstd"
  ) {
    bytes = await decompress(bytes, encoding);
    decodedBytes = bytes.byteLength;
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
      wireBytes,
      decodedBytes,
    };
  }

  // Step 5: Detect JSON
  if (contentType?.toLowerCase().includes("json")) {
    try {
      const parsed: unknown = JSON.parse(text);
      const prettyText = JSON.stringify(parsed, null, 2);
      return {
        kind: "json",
        text: prettyText,
        mediaType,
        wireBytes,
        decodedBytes,
      };
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
    return { kind: "binary", mediaType, wireBytes, decodedBytes };
  }

  // Step 7: Default to text
  return { kind: "text", text, mediaType, wireBytes, decodedBytes };
}
