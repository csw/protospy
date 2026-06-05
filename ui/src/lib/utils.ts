import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import type { ProxyHeaders } from "@bindings/ProxyHeaders";

/**
 * Configured tailwind-merge instance that knows about the custom font-size
 * and font-family tokens defined in `theme/tailwind.css`. Without this,
 * `twMerge` treats e.g. `text-ui-xs` (font-size) and `text-m-get` (color)
 * as the same `text-*` group and strips the font-size class.
 *
 * The tokens are registered via the v4-idiomatic `theme` namespaces (mirroring
 * Tailwind's `@theme` keys 1:1 — font sizes under `text`, families under
 * `font`) rather than the lower-level `classGroups` form. See design-system
 * §2.4.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["ui", "ui-xs", "ui-sm", "ui-mono", "ctx-path"],
      font: ["ui", "mono"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Bounded, spaced size format for the table SIZE column, which renders a single
 * size in a fixed-width track that must never truncate. Unlike `formatSize`
 * (which caps at MB and so grows unboundedly for large bodies, e.g.
 * `5120.0MB`), this scales through GB/TB so the value stays at most ~3 integer
 * digits + 1 decimal — a known maximum width (`1023.9 GB`) the column can size
 * to. One decimal place; a space before the unit (`1.5 KB`, `58 B`, `5.0 GB`).
 */
export function formatSizeShort(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  // The unit was chosen from the un-rounded value, but we display rounded to 1
  // decimal — so a value like 1023.99 KB would print "1024.0 KB". If rounding
  // tips it to ≥1024 and a larger unit exists, roll up one unit (→ "1.0 MB").
  if (Number(value.toFixed(1)) >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

/**
 * Normalised `Content-Encoding` value for inline display next to a wire
 * size (e.g. `1.6KB (gzip)`). Returns `null` for absent or trivial
 * encodings (`identity`, empty) so callers can `&&` it inline.
 *
 * Returns the lowercased encoding verbatim for anything else — including
 * comma-separated multi-encodings (`gzip, br`). We'd rather show the raw
 * string than guess at canonicalising it.
 */
export function shortEncoding(encoding: string | undefined): string | null {
  if (!encoding) return null;
  const lower = encoding.toLowerCase().trim();
  if (lower === "" || lower === "identity") return null;
  return lower;
}

export function statusClass(
  status: string | undefined,
): "ok" | "redir" | "cli" | "srv" | "pending" | "err" {
  if (status == null) return "pending";
  const code = parseInt(status, 10);
  if (isNaN(code)) return "err";
  if (code >= 500) return "srv";
  if (code >= 400) return "cli";
  if (code >= 300) return "redir";
  return "ok";
}

export function methodBadgeClass(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-m-get-bg text-m-get";
    case "POST":
      return "bg-m-post-bg text-m-post";
    case "PUT":
      return "bg-m-put-bg text-m-put";
    case "PATCH":
      return "bg-m-patch-bg text-m-patch";
    case "DELETE":
      return "bg-m-delete-bg text-m-delete";
    case "HEAD":
      return "bg-m-head-bg text-m-head";
    case "OPTIONS":
      return "bg-m-opts-bg text-m-opts";
    default:
      return "bg-bg-sub text-mid";
  }
}

export function methodTextClass(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "text-m-get";
    case "POST":
      return "text-m-post";
    case "PUT":
      return "text-m-put";
    case "PATCH":
      return "text-m-patch";
    case "DELETE":
      return "text-m-delete";
    case "HEAD":
      return "text-m-head";
    case "OPTIONS":
      return "text-m-opts";
    default:
      return "text-mid";
  }
}

export function statusTextClass(
  status: string,
): "text-green" | "text-amber" | "text-red" {
  const code = parseInt(status, 10);
  if (code >= 200 && code < 300) return "text-green";
  if (code >= 300 && code < 400) return "text-amber";
  return "text-red";
}

export function statusChipClass(
  status: string,
):
  | "border-green text-green"
  | "border-amber text-amber"
  | "border-red text-red" {
  const code = parseInt(status, 10);
  if (code >= 200 && code < 300) return "border-green text-green";
  if (code >= 300 && code < 400) return "border-amber text-amber";
  return "border-red text-red";
}

const TRACE_PALETTE = [
  "oklch(0.66 0.17 30)", // orange
  "oklch(0.66 0.14 95)", // gold
  "oklch(0.66 0.17 150)", // green
  "oklch(0.66 0.13 210)", // cyan
  "oklch(0.60 0.18 260)", // blue
  "oklch(0.58 0.21 300)", // purple
  "oklch(0.64 0.20 350)", // magenta
];

export function traceColor(traceId: string): string {
  let hash = 0;
  for (let i = 0; i < traceId.length; i++) {
    hash = ((hash << 5) - hash + traceId.charCodeAt(i)) | 0;
  }
  return TRACE_PALETTE[((hash % 7) + 7) % 7];
}

export function formatRelative(
  timestamp: string,
  now: number = Date.now(),
): string {
  const diffMs = now - new Date(timestamp).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return "now";
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  return `${Math.floor(diffMin / 60)}h`;
}

export function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export type TimeZone = "local" | "utc";

/**
 * Format a timestamp as an absolute time with millisecond resolution.
 * Returns `HH:MM:SS.mmm` in either local or UTC time zone.
 * Suitable for log correlation — milliseconds help match events across
 * different log sources.
 */
export function formatAbsoluteTime(
  timestamp: string,
  tz: TimeZone = "local",
): string {
  const d = new Date(timestamp);
  if (tz === "utc") {
    const h = String(d.getUTCHours()).padStart(2, "0");
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    const s = String(d.getUTCSeconds()).padStart(2, "0");
    const ms = String(d.getUTCMilliseconds()).padStart(3, "0");
    return `${h}:${m}:${s}.${ms}`;
  }
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

export function matchesFilter(
  ex: { method?: string; uri?: string; status?: string },
  filter: string,
): boolean {
  if (!filter) return true;
  const q = filter.toLowerCase();
  const method = (ex.method ?? "").toLowerCase();
  const uri = (ex.uri ?? "").toLowerCase();
  const status = (ex.status ?? "").toLowerCase();
  return method.includes(q) || uri.includes(q) || status.includes(q);
}

export function splitUri(uri: string): { path: string; query: string } {
  const q = uri.indexOf("?");
  if (q === -1) return { path: uri, query: "" };
  return { path: uri.slice(0, q), query: uri.slice(q) };
}

export function parseQueryParams(
  uri: string,
): Array<{ key: string; value: string }> {
  const qIdx = uri.indexOf("?");
  if (qIdx === -1) return [];
  try {
    const usp = new URLSearchParams(uri.slice(qIdx + 1));
    const params: Array<{ key: string; value: string }> = [];
    usp.forEach((value, key) => params.push({ key, value }));
    return params;
  } catch {
    return [];
  }
}

export function shortenTraceId(id: string): string {
  if (id.length >= 8) {
    return `${id.slice(0, 4)}…${id.slice(-4)}`;
  }
  return id;
}

export function isBulkOperation(uri: string | undefined | null): boolean {
  if (uri == null) return false;
  return uri.includes("_msearch") || uri.includes("_mget");
}

// ---------------------------------------------------------------------------
// Headers utilities
// ---------------------------------------------------------------------------

/** Headers pinned to the top of the headers view, in display order. */
export const PINNED_HEADER_NAMES: readonly string[] = [
  "content-type",
  "content-encoding",
  "authorization",
  "traceparent",
  "cache-control",
];

const MASK = "**********";

/**
 * Returns the display value for a header. For `authorization` headers the
 * credential is masked (scheme is shown, e.g. "Bearer **********"). All other
 * headers pass through unchanged.
 */
export function maskHeaderValue(name: string, value: string): string {
  if (name.toLowerCase() !== "authorization") return value;
  const spaceIdx = value.indexOf(" ");
  if (spaceIdx !== -1) return value.slice(0, spaceIdx + 1) + MASK;
  // No scheme prefix — show first 8 chars, mask the rest
  return value.slice(0, 8) + MASK;
}

/**
 * Decodes a Basic Authorization credential to `user:password`.
 * Returns the decoded string, or `null` if the value is not a Basic token or
 * the base64 payload is malformed.
 * Input should be the **raw** (unmasked) header value.
 */
export function decodeBasicAuth(value: string): string | null {
  if (!value.toLowerCase().startsWith("basic ")) return null;
  try {
    return atob(value.slice(6).trim());
  } catch {
    return null;
  }
}

/**
 * Filter a header list to entries whose name or value contains `query`
 * (case-insensitive substring match). Returns the full list when `query` is
 * empty.
 */
export function filterHeaders(
  headers: ProxyHeaders,
  query: string,
): ProxyHeaders {
  if (!query) return headers;
  const q = query.toLowerCase();
  return headers.filter(
    (h) =>
      h.name.toLowerCase().includes(q) || h.value.toLowerCase().includes(q),
  );
}

/**
 * Sorts a header list so that entries whose (lowercased) name appears in
 * `PINNED_HEADER_NAMES` float to the top in the order defined there. All
 * remaining headers follow in their original relative order.
 */
export function sortHeadersByPin(headers: ProxyHeaders): ProxyHeaders {
  const pinned: ProxyHeaders = [];
  const rest: ProxyHeaders = [];
  for (const h of headers) {
    if (PINNED_HEADER_NAMES.includes(h.name.toLowerCase())) {
      pinned.push(h);
    } else {
      rest.push(h);
    }
  }
  pinned.sort(
    (a, b) =>
      PINNED_HEADER_NAMES.indexOf(a.name.toLowerCase()) -
      PINNED_HEADER_NAMES.indexOf(b.name.toLowerCase()),
  );
  return [...pinned, ...rest];
}

export function eventTypeBadgeClass(type: string): string {
  switch (type) {
    case "message_start":
      return "text-purple-500 bg-purple-500/10";
    case "content_block_start":
    case "content_block_stop":
    case "content_block_delta":
      return "text-green bg-green-500/10";
    case "message_delta":
      return "text-accent bg-accent/10";
    case "message_stop":
      return "text-mid bg-bg-sub";
    case "ping":
      return "text-dim bg-bg-sub";
    default:
      return "text-ink-2 bg-bg-sub";
  }
}
