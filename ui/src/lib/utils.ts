import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
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

export function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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
