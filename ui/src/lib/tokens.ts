// src/lib/tokens.ts — pure mappings from domain values to design tokens.
// These return token *names*/CSS-var strings, never raw colors. Components turn
// them into Tailwind classes (text-ok, bg-method-get-bg) or inline `var()` for
// the few genuinely dynamic cases (trace color per id).

import type { StatusKind } from "./types";

// PRO-341: re-export StatusKind so consumers can import it alongside the
// classification helpers from this barrel (status-code.tsx / msearch-view.tsx
// import `type StatusKind` from here). The v2.3 scaffold omitted this re-export.
export type { StatusKind };

export function statusClass(
  status: number | null,
  hasError = false,
): StatusKind {
  if (hasError) return "error";
  if (status == null) return "pending";
  if (status >= 500) return "server";
  if (status >= 400) return "client";
  if (status >= 300) return "redirect";
  return "ok";
}

export const STATUS_REASON: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/** Full status line for rows mode, e.g. "404 Not Found". Table mode uses the code only. */
export function statusLine(status: number | null): string | null {
  if (status == null) return null;
  const reason = STATUS_REASON[status];
  return reason ? `${status} ${reason}` : String(status);
}

// ── trace color ──
// Deterministic hash(traceId) % 7 → one of the --trace-1..7 tokens.
const TRACE_TOKEN_COUNT = 7;

function hashTrace(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** 1-based token index, e.g. for building `text-trace-${n}` / `bg-trace-${n}`. */
export function traceTokenIndex(traceId: string): number {
  return (hashTrace(traceId) % TRACE_TOKEN_COUNT) + 1;
}

/** CSS var for inline styles where the color is dynamic (rail bars, swatches, row borders). */
export function traceColorVar(traceId: string): string {
  return `var(--trace-${traceTokenIndex(traceId)})`;
}

/** Display form: first 4 + last 4 (XXXX…XXXX). */
export function shortTraceId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 4)}…${id.slice(-4)}`;
}
