// Body download helpers (PRO-420, absorbing PRO-413). The body header strip
// exposes a download button for every content type; `deriveFilename` is the
// pure name-resolution logic (Content-Disposition → request path → content-type
// extension → `.bin`) following the standard browser algorithm, and
// `triggerDownload` performs the actual browser download.
import mime from "mime";

function baseType(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

/**
 * Extract a filename from a Content-Disposition header value. Handles both the
 * plain `filename="x"` form and the RFC 5987 `filename*=UTF-8''x` extended
 * form (preferred when present). Returns `undefined` when no filename is given.
 */
function filenameFromDisposition(disposition: string): string | undefined {
  const ext = disposition.match(/filename\*\s*=\s*[^']*''([^;]+)/i);
  if (ext != null) {
    try {
      return decodeURIComponent(ext[1].trim());
    } catch {
      // Malformed percent-encoding — fall through to the plain form.
    }
  }
  const plain = disposition.match(/filename\s*=\s*"?([^";]+)"?/i);
  if (plain != null) return plain[1].trim();
  return undefined;
}

function extensionFor(contentType: string | undefined): string {
  if (contentType == null) return "bin";
  const base = baseType(contentType);
  // NDJSON/JSONL variants (`application/x-ndjson`, the ES
  // `application/vnd.elasticsearch+x-ndjson`) before the generic JSON suffix,
  // since they are not in the MIME registry.
  if (/ndjson|jsonl/.test(base)) return "ndjson";
  // Structured-syntax suffixes (`application/vnd.foo+json`,
  // `application/something+xml`) are common for vendor types — e.g. the
  // Elasticsearch `application/vnd.elasticsearch+json` msearch response — and
  // the MIME registry doesn't enumerate them. Map by suffix as a browser does.
  if (base.endsWith("+json")) return "json";
  if (base.endsWith("+xml")) return "xml";
  // The IANA MIME → extension registry covers the rest (json, html, csv,
  // image/*, pdf, …). `mime` is the standard, widely-used table.
  const ext = mime.getExtension(base);
  if (ext != null) return ext;
  if (base.startsWith("text/")) return "txt";
  return "bin";
}

/** The basename of a request URI path, without query string. Empty if none. */
function basenameFromUri(uri: string): string {
  const path = uri.split(/[?#]/)[0];
  const segment = path.split("/").filter(Boolean).pop() ?? "";
  return segment;
}

/**
 * Resolve a download filename for a body. Precedence: Content-Disposition
 * filename, then the request path's basename, falling back to `body`. An
 * extension derived from the content-type is appended when the chosen name has
 * none; the ultimate fallback is `.bin`.
 */
export function deriveFilename(opts: {
  contentDisposition?: string;
  uri?: string;
  contentType?: string;
}): string {
  const { contentDisposition, uri, contentType } = opts;

  if (contentDisposition != null) {
    const fromHeader = filenameFromDisposition(contentDisposition);
    if (fromHeader != null && fromHeader.length > 0) return fromHeader;
  }

  const base = (uri != null ? basenameFromUri(uri) : "") || "body";
  if (/\.[^./]+$/.test(base)) return base;
  return `${base}.${extensionFor(contentType)}`;
}

/** Trigger a browser download of `bytes` as `filename`. Browser-only. */
export function triggerDownload(
  bytes: Uint8Array,
  filename: string,
  mediaType: string,
): void {
  // A fresh ArrayBuffer-backed copy avoids a SharedArrayBuffer-typed BlobPart.
  const blob = new Blob([new Uint8Array(bytes)], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
