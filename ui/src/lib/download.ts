/**
 * Derive a download filename from available hints, following the browser's
 * standard priority order:
 * 1. Content-Disposition filename parameter
 * 2. Last path segment of the request URI (if it has an extension)
 * 3. "body" + extension inferred from the media type
 * 4. "body.bin" fallback
 */
export function deriveFilename(opts: {
  uri?: string;
  contentDisposition?: string;
  mediaType?: string;
}): string {
  const { uri, contentDisposition, mediaType } = opts;

  // 1. Content-Disposition filename
  if (contentDisposition != null) {
    const match =
      // RFC 5987 extended notation: filename*=UTF-8''...
      contentDisposition.match(/filename\*=UTF-8''([^\s;]+)/i) ??
      // Plain quoted: filename="foo.bin"
      contentDisposition.match(/filename="([^"]+)"/i) ??
      // Plain unquoted: filename=foo.bin
      contentDisposition.match(/filename=([^\s;]+)/i);
    if (match != null) {
      const raw = match[1];
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }

  // 2. Last path segment of the URI when it carries an extension
  if (uri != null) {
    const path = uri.split("?")[0];
    const segment = path.split("/").filter(Boolean).pop() ?? "";
    if (segment.includes(".")) {
      return segment;
    }
  }

  // 3. "body" + extension inferred from media type
  const ext = extensionForMediaType(mediaType);
  return `body${ext}`;
}

/** Map a media-type string to a file extension, falling back to ".bin". */
function extensionForMediaType(mediaType?: string): string {
  if (mediaType == null) return ".bin";
  const base = mediaType.split(";")[0].trim().toLowerCase();
  return MEDIA_TYPE_EXT[base] ?? ".bin";
}

const MEDIA_TYPE_EXT: Record<string, string> = {
  "application/json": ".json",
  "application/ld+json": ".jsonld",
  "application/xml": ".xml",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/gzip": ".gz",
  "application/octet-stream": ".bin",
  "application/x-ndjson": ".ndjson",
  "application/ndjson": ".ndjson",
  "application/vnd.elasticsearch+x-ndjson": ".ndjson",
  "text/plain": ".txt",
  "text/html": ".html",
  "text/css": ".css",
  "text/csv": ".csv",
  "text/xml": ".xml",
  "text/javascript": ".js",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

/**
 * Trigger a browser file download for arbitrary bytes. Creates a temporary
 * object URL, simulates a click, and immediately revokes the URL.
 */
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
): void {
  // Slice to ensure a concrete ArrayBuffer (TS6 Blob requires ArrayBuffer, not
  // ArrayBufferLike, which may include SharedArrayBuffer).
  const blob = new Blob([bytes.slice()], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
