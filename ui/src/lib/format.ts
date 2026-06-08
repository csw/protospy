// src/lib/format.ts — app-owned display formatters (PRO-346).
//
// The v2.3 scaffolds (src/components/protospy/*) import these app-owned helpers;
// Claude Design does not ship them because the exact output strings are ours to
// own (design-system.md hard rules 3/8/9 — size renders in full, elapsed and time
// have fixed formats). The media-type slug is the abbreviated display term, with
// the raw header preserved separately for the tooltip.
//
// These are the CANONICAL formatters and the terse names are authoritative.
// `lib/utils.ts` re-exports `fmtBytes` as the legacy `formatSizeShort` and adapts
// `fmtClock` as `formatAbsoluteTime` (string timestamp) for the live components,
// so there is exactly one implementation of each — no second set of helpers.

/**
 * Human-readable wire/decoded byte size with a space before the unit:
 * `"503 B"`, `"1.5 KB"`, `"2.3 GB"`. Scales through KB/MB/GB/TB so the value
 * stays a bounded width (at most `"1023.9 GB"`) the SIZE column can size to —
 * one decimal place above bytes, whole numbers for raw bytes.
 */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
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
 * Elapsed duration with a space before the unit: `"503 ms"`, `"1.2 s"`.
 * Sub-second values render as whole milliseconds; ≥1 s renders as seconds to
 * one decimal. `null` (elapsed not yet known) renders as an em dash.
 */
export function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Absolute clock time `HH:MM:SS.mmm` (millisecond precision) in local or UTC
 * time, honoring the list toolbar's Local/UTC toggle (design-system hard rule 9).
 * Millisecond resolution helps correlate events against other log sources.
 */
export function fmtClock(
  epochMs: number,
  tz: "local" | "utc" = "local",
): string {
  const d = new Date(epochMs);
  const pad = (v: number, width = 2) => String(v).padStart(width, "0");
  const [h, m, s, ms] =
    tz === "utc"
      ? [
          d.getUTCHours(),
          d.getUTCMinutes(),
          d.getUTCSeconds(),
          d.getUTCMilliseconds(),
        ]
      : [d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()];
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

/**
 * Abbreviated media-type slug for the cramped table/inspector display, derived
 * from a full Content-Type header. Parameters (charset, boundary,
 * compatible-with, …) are dropped and the type collapses to the
 * developer-meaningful subtype:
 *
 *   application/vnd.elasticsearch+json; compatible-with=8  → "json"
 *   application/json; charset=utf-8                        → "json"
 *   application/vnd.elasticsearch+x-ndjson                 → "x-ndjson"
 *   text/event-stream                                      → "event-stream"
 *   image/png                                              → "png"
 *
 * A structured-syntax suffix (`+json`, `+xml`, …) wins — it is the meaningful
 * kind. The full header is preserved separately as `rawContentType` for the
 * tooltip, so the vendor/parameter detail collapsed here is never lost. A value
 * with no `/` (malformed, or already a bare slug) is returned param-stripped
 * as-is.
 */
export function mediaTypeSlug(full: string): string {
  const base = full.split(";")[0].trim().toLowerCase();
  const slash = base.indexOf("/");
  if (slash === -1) return base;
  const subtype = base.slice(slash + 1);
  const plus = subtype.lastIndexOf("+");
  // A trailing "+" (nothing after it) is not a usable suffix — fall back to the
  // whole subtype.
  if (plus !== -1 && plus < subtype.length - 1) {
    return subtype.slice(plus + 1);
  }
  return subtype;
}
