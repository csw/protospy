// src/lib/format.ts — STUB (PRO-341 ingest).
//
// The v2.3 scaffolds reference these app-owned formatters but Claude Design does
// not ship them: byte/elapsed/clock formatting and their exact output strings are
// ours to own (design-system.md hard rules 3/8/9). These placeholders exist only
// so the scaffolds type-check in isolation while they are not yet wired into the
// live app.
//
// PRO-346 (app-owned format helpers + error/media-type plumbing) replaces this
// file with the real implementations — likely re-exporting the canonical
// formatters that already live in `lib/utils.ts` (formatSize, formatAbsoluteTime,
// …). Do NOT build the production formatters here; keep these provisional.

/** Human-readable wire/decoded byte size, e.g. "1.2 KB". STUB — see PRO-346. */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** Elapsed duration, e.g. "42 ms" / "1.20 s"; "—" when unknown. STUB — see PRO-346. */
export function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Absolute clock time HH:MM:SS.mmm in local or UTC. STUB — see PRO-346. */
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
