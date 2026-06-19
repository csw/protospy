import type { BodyState } from "@ui/state/reducer";
import type { BodyChunk } from "@bindings/BodyChunk";
import { parseJson, parseNdjson } from "./json-parse";
import { formatMarkup } from "./markup-format";
import type { MarkupLine } from "./markup-format-core";
import type { JsonValue } from "../components/json-tree/model";
import type { FlatRow } from "../components/json-tree/flatten";
import type { ContentKind } from "./view-modes";

export interface DecodeResult {
  kind: ContentKind;
  /**
   * Whether the body can be shown as Unicode text — the `text` view-mode's
   * availability predicate (PRO-420). True when the proxy sent text chunks
   * (valid UTF-8 by construction) or, for binary chunks, when the Content-Type
   * declares a charset `TextDecoder` supports. Computed once per decode.
   */
  textAvailable: boolean;
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
  /**
   * For `json` kind: the already-parsed JSON value, available for lazy
   * tree rebuild when the user expands/collapses nodes. `undefined` for
   * all other kinds.
   */
  parsed?: JsonValue;
  /**
   * For `ndjson` kind: the per-line parsed documents, available for lazy forest
   * rebuild on interaction. `undefined` for all other kinds.
   */
  documents?: JsonValue[];
  /**
   * For `json` and `ndjson` kinds: pre-built flat rows from the Worker (initial
   * render uses these instead of re-building the tree on the main thread).
   * `undefined` for all other kinds.
   */
  initialRows?: readonly FlatRow[];
  /**
   * For `json` and `ndjson` kinds: the default expanded node-ID set, computed
   * off-thread alongside the initial rows. `undefined` for all other kinds.
   */
  initialExpanded?: ReadonlySet<number>;
  /**
   * For `json`/`ndjson` kinds: true when the body was truncated and only a valid
   * prefix could be recovered (a size cap or interrupted capture). Drives the
   * truncation banner and the in-tree cut-point marker. Never set for a body that
   * parsed cleanly.
   */
  truncated?: boolean;
  /**
   * For `html`/`xml` kinds: per-line highlight tokens for the virtualized
   * formatted view (PRO-414), pretty-printed and tokenized in a Worker. The
   * `text` field carries the matching re-indented source. `undefined` for all
   * other kinds, and when a fatal worker error left the formatted view to fall
   * back to plain text.
   */
  lines?: MarkupLine[];
  /**
   * The decompressed body decoded as UTF-8 text, with NO pretty-printing or
   * classification applied. Equals `text` for the `text` kind; for `json`/
   * `jsonl` it is the original (un-pretty) source; for `binary` it is the bytes
   * decoded as text (may contain replacement characters). Backs the `raw`
   * view-mode escape hatch (PRO-336).
   */
  rawText: string;
  /**
   * The decompressed body bytes. Backs the `hex` view-mode dump (PRO-336).
   */
  bytes: Uint8Array;
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

  // Ensure data has a concrete ArrayBuffer (not SharedArrayBuffer) for the writer.
  // Attach no-op catchers to the write/close promises — when the payload is
  // corrupt the stream errors and these promises reject, but their rejections
  // are noise: the actual error surfaces through reader.read() below and
  // propagates up as a rejection on this async function. Without the catchers
  // the write/close rejections would escape as unhandled-rejection page errors
  // even though useDecodeBody's .catch() handles the outer promise correctly.
  writer.write(new Uint8Array(data)).catch(() => {});
  writer.close().catch(() => {});

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

function baseType(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

/**
 * Known textual `application/*` types that should be rendered as text rather
 * than falling through to the binary summary.
 */
const TEXTUAL_APPLICATION_TYPES = new Set([
  "application/csv",
  "application/javascript",
  "application/typescript",
  "application/yaml",
  "application/toml",
  "application/x-www-form-urlencoded",
  "application/graphql",
]);

/**
 * Returns true for content types that carry human-readable text: all `text/*`
 * types (excluding those handled as dedicated kinds, e.g. html/xml/json) plus
 * known textual `application/*` types.
 */
function isTextualContentType(contentType: string): boolean {
  const base = baseType(contentType);
  return base.startsWith("text/") || TEXTUAL_APPLICATION_TYPES.has(base);
}

/**
 * Extract the `charset` parameter from a Content-Type header value, or return
 * null if absent. Example: `"text/csv; charset=iso-8859-1"` → `"iso-8859-1"`.
 */
function charsetFromContentType(
  contentType: string | undefined,
): string | null {
  const match = contentType?.match(/charset\s*=\s*([^;]+)/i);
  return match ? match[1].trim() : null;
}

/**
 * Decode `bytes` to a string. When the body arrived as binary chunks and the
 * Content-Type declares a charset, that charset is used so that non-UTF-8
 * encodings (ISO-8859-1, UTF-16, etc.) render correctly. Falls back to UTF-8
 * for unknown charsets and for bodies whose chunks were already valid UTF-8
 * (text chunks), where the charset parameter is redundant.
 */
function decodeBytesToText(
  bytes: Uint8Array,
  hasBinaryChunk: boolean,
  charset: string | null,
): string {
  if (hasBinaryChunk && charset !== null) {
    try {
      // ignoreBOM defaults to false, meaning the BOM is processed (stripped
      // from the output), not passed through — correct for UTF-16 (BOM hints
      // endianness but is not data) and a no-op for ISO-8859-1.
      return new TextDecoder(charset).decode(bytes);
    } catch {
      // Unknown or unsupported charset — fall back to UTF-8.
    }
  }
  return new TextDecoder().decode(bytes);
}

const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const XML_TYPES = new Set([
  "text/xml",
  "application/xml",
  "application/soap+xml",
  "application/rss+xml",
  "application/atom+xml",
]);

function isHtmlContentType(contentType: string): boolean {
  return HTML_TYPES.has(baseType(contentType));
}

function isXmlContentType(contentType: string): boolean {
  const base = baseType(contentType);
  // The listed XML media types plus the generic `application/*+xml` suffix.
  return XML_TYPES.has(base) || base.endsWith("+xml");
}

/**
 * The `text` view-mode availability predicate (PRO-420). Text chunks are valid
 * UTF-8 by construction; binary chunks are displayable as text only when the
 * Content-Type declares a charset `TextDecoder` accepts.
 */
function computeTextAvailable(
  chunks: BodyChunk[],
  contentType: string | undefined,
): boolean {
  const hasBinaryChunk = chunks.some((c) => "binary" in c);
  if (!hasBinaryChunk) return true;
  const charset = charsetFromContentType(contentType);
  if (charset === null) return false;
  try {
    // Constructing the decoder is the supported-label check — it throws a
    // RangeError for an unknown encoding label.
    new TextDecoder(charset);
    return true;
  } catch {
    return false;
  }
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

  // Step 3: Decode bytes to text. When the body arrived as binary chunks and
  // the Content-Type declares a charset, use that charset so non-UTF-8
  // encodings (ISO-8859-1, UTF-16, …) render correctly (PRO-415).
  const hasBinaryChunk = chunks.some((c) => "binary" in c);
  const charset = charsetFromContentType(contentType);
  const text = decodeBytesToText(bytes, hasBinaryChunk, charset);

  // The text-mode availability predicate, computed once per decode (PRO-420).
  const textAvailable = computeTextAvailable(chunks, contentType);

  // Step 4: Detect NDJSON/JSONL — must precede generic JSON check because ndjson
  // MIME types contain the substring "json" and would otherwise be mishandled.
  // Parsed in the Worker into a forest of per-line document trees; falls through
  // to plain text when no documents could be recovered.
  if (contentType != null && isJsonlContentType(contentType)) {
    try {
      const { documents, prettyText, rows, defaultExpanded, truncated } =
        await parseNdjson(text);
      return {
        kind: "ndjson",
        textAvailable,
        text: prettyText,
        documents: documents ?? undefined,
        initialRows: rows,
        initialExpanded: defaultExpanded,
        truncated,
        mediaType,
        wireBytes,
        decodedBytes,
        rawText: text,
        bytes,
      };
    } catch {
      // no parseable NDJSON documents — fall through to plain text
    }
  }

  // Step 5: Detect JSON — parse in a Web Worker so multi-MB bodies don't
  // block the UI thread. A truncated body is recovered to its valid prefix;
  // only a wholly unparseable body falls through to plain text.
  if (contentType?.toLowerCase().includes("json")) {
    try {
      const { parsed, prettyText, rows, defaultExpanded, truncated } =
        await parseJson(text);
      return {
        kind: "json",
        textAvailable,
        text: prettyText,
        parsed: parsed ?? undefined,
        initialRows: rows,
        initialExpanded: defaultExpanded,
        truncated,
        mediaType,
        wireBytes,
        decodedBytes,
        rawText: text,
        bytes,
      };
    } catch {
      // invalid JSON — fall through to plain text
    }
  }

  // Step 6: Markup — HTML and XML get their own kinds (formatted-view slot,
  // PRO-414). A Worker re-indents the (often minified) body and tokenizes it
  // into per-line highlight tokens for the virtualized formatted view; `text`
  // becomes the re-indented source (backs the formatted-view copy), `rawText`
  // stays the un-formatted source for the raw view. A fatal worker error
  // degrades gracefully: no `lines`, and the formatted view falls back to text.
  const markupKind =
    contentType != null && isHtmlContentType(contentType)
      ? "html"
      : contentType != null && isXmlContentType(contentType)
        ? "xml"
        : null;
  if (markupKind != null) {
    try {
      const { lines, formattedText } = await formatMarkup(text, markupKind);
      return {
        kind: markupKind,
        textAvailable,
        text: formattedText,
        lines,
        mediaType,
        wireBytes,
        decodedBytes,
        rawText: text,
        bytes,
      };
    } catch {
      // Fatal worker failure — keep the markup kind but render as plain text.
      return {
        kind: markupKind,
        textAvailable,
        text,
        mediaType,
        wireBytes,
        decodedBytes,
        rawText: text,
        bytes,
      };
    }
  }

  // Step 7: Explicit text types — all text/* (not already handled as html/xml)
  // plus known textual application/* types. Makes the intent explicit rather
  // than relying on the step-9 fallthrough, so future binary-classification
  // steps can't inadvertently catch textual content (PRO-415).
  if (contentType != null && isTextualContentType(contentType)) {
    return {
      kind: "text",
      textAvailable,
      text,
      mediaType,
      wireBytes,
      decodedBytes,
      rawText: text,
      bytes,
    };
  }

  // Step 8: Images get their own kind for the rendered-view slot (PRO-412).
  if (contentType?.startsWith("image/")) {
    return {
      kind: "image",
      textAvailable,
      mediaType,
      wireBytes,
      decodedBytes,
      rawText: text,
      bytes,
    };
  }

  // Step 9: Other non-text binary content (audio, video, octet-stream, …).
  const binaryPrefixes = ["audio/", "video/", "application/octet-stream"];
  if (binaryPrefixes.some((prefix) => contentType?.startsWith(prefix))) {
    return {
      kind: "binary",
      textAvailable,
      mediaType,
      wireBytes,
      decodedBytes,
      rawText: text,
      bytes,
    };
  }

  // Step 10: Default to text
  return {
    kind: "text",
    textAvailable,
    text,
    mediaType,
    wireBytes,
    decodedBytes,
    rawText: text,
    bytes,
  };
}
