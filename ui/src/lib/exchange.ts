// src/lib/exchange.ts — the consumed-interface helper module over the live
// `Exchange` (PRO-359, Slice 1; per `UI/v2.3/body-interface-design.md`).
//
// The v2.3 scaffolds were ingested against an idealized `Exchange` (lib/types.ts:
// numeric status, eager `MessageSide` aggregate). The live runtime model
// (`state/types.ts`) is flat and string-typed: `status` is a string ("200 OK"),
// `error` is `{ kind: "generic", direction, message }`, and body size/encoding live
// on `requestBody`/`responseBody` (`BodyState`). This module is the small,
// MessageSide-level + string-`status` read surface the list (and, from Slice 2, the
// inspector) consume so the components read live fields without re-deriving them.
//
// It is deliberately NOT the body-decode accessor (`useDecodedEntity`, O1) — that
// lazy text seam is Slice 2's. The list only needs synchronous size/encoding reads
// and the status/error/protocol predicates below.

import type { BodyState, Exchange } from "@ui/state/types";
import type { StatusKind } from "@ui/lib/tokens";
import { fmtBytes } from "@ui/lib/format";
import { isBulkOperation, shortEncoding } from "@ui/lib/utils";

/**
 * Classify a live string `status` (e.g. "200 OK", "404 Not Found") into the v2.3
 * `StatusKind` that drives the status color tokens (`text-ok`/`text-server`/…).
 * `hasError` (a transport failure) wins over any arrived status; an absent status
 * is `pending`; a non-numeric status is treated as an error.
 *
 * The number-based counterpart is `statusClass` in `lib/tokens.ts`; this is the
 * string-typed variant the live model needs (the wire `status` is a string).
 */
export function statusKind(
  status: string | undefined,
  hasError = false,
): StatusKind {
  if (hasError) return "error";
  if (status == null) return "pending";
  const code = parseInt(status, 10);
  if (Number.isNaN(code)) return "error";
  if (code >= 500) return "server";
  if (code >= 400) return "client";
  if (code >= 300) return "redirect";
  return "ok";
}

/**
 * The numeric code portion of a live status string for table mode (numeric code
 * only — kept deviation §3). "200 OK" → "200"; the full reason-phrase line is the
 * string itself, used directly in rows mode.
 */
export function statusCodeOnly(status: string): string {
  return status.split(" ")[0];
}

/**
 * The single shared display model for a body's wire/decoded/encoding size — the
 * one place that decides how those three facts read across every surface (the
 * list rows, the table SIZE column, the inspector Timing facts, and the body
 * pane / summary header). Callers render the fields they have room for: the
 * width-bounded table cell shows `wireBytes` only with the breakdown in the
 * `tooltip`; the roomier facts/header surfaces render the dual figure via
 * {@link sizeText}. `wireBytes` is `null` when there is no body at all (render
 * an em dash). All byte counts format with the canonical, bounded `fmtBytes`.
 */
export interface SizeView {
  /** Wire (post-compression) byte count; null = no body on this side. */
  wireBytes: number | null;
  /**
   * Decoded (post-decompression) byte count, but only when it is known AND
   * differs from `wireBytes` (a real compression delta). `null` otherwise — so
   * a caller can render the dual `wire / decoded` figure iff this is non-null.
   */
  decodedBytes: number | null;
  /** Normalized content-encoding tag (e.g. "gzip"), or null when uncompressed. */
  encoding: string | null;
  /** wire/decoded breakdown for the tooltip; only set for a compressed body. */
  tooltip: string | undefined;
}

/**
 * Build a {@link SizeView} from the three primitive size facts a body carries —
 * the shared core every surface routes through. `contentEncoding` is normalized
 * via {@link shortEncoding}, so `identity`/empty are suppressed everywhere (not
 * just in the table). The tooltip carries the wire/decoded breakdown
 * (Chrome-DevTools convention, kept deviation §3) and is present only for a
 * compressed body.
 */
export function buildSizeView(
  wireBytes: number | null | undefined,
  decodedBytes: number | null | undefined,
  contentEncoding: string | undefined,
): SizeView {
  if (wireBytes == null)
    return {
      wireBytes: null,
      decodedBytes: null,
      encoding: null,
      tooltip: undefined,
    };
  const encoding = shortEncoding(contentEncoding);
  // A decoded size is only a distinct fact when it's known and differs from the
  // wire size — equal sizes mean no real compression delta to show.
  const decoded =
    decodedBytes != null && decodedBytes !== wireBytes ? decodedBytes : null;
  if (encoding == null)
    return {
      wireBytes,
      decodedBytes: null,
      encoding: null,
      tooltip: undefined,
    };
  const tooltip =
    decoded != null
      ? `${fmtBytes(wireBytes)} on the wire / ${fmtBytes(decoded)} after decompression (${encoding})`
      : `${fmtBytes(wireBytes)} on the wire (${encoding}; decoded size unknown until the body is opened)`;
  return { wireBytes, decodedBytes: decoded, encoding, tooltip };
}

/** Build a {@link SizeView} from one side's `BodyState` (or `undefined` = no body). */
export function sizeView(body: BodyState | undefined): SizeView {
  return body == null
    ? buildSizeView(null, null, undefined)
    : buildSizeView(body.wireBytes, body.decodedBytes, body.contentEncoding);
}

/** The response side's {@link SizeView} — the value the SIZE column renders. */
export function responseSizeView(ex: Exchange): SizeView {
  return sizeView(ex.responseBody);
}

/**
 * The inline size value for surfaces with room for the dual figure (inspector
 * facts, body pane/summary header): `"1.5 KB"`, or `"1.5 KB / 4.2 KB"` when the
 * decoded size is known and differs. An em dash when there's no body. The
 * width-bounded table SIZE column does NOT use this — it renders
 * `fmtBytes(wireBytes)` alone and puts the breakdown in the tooltip instead.
 */
export function sizeText(view: SizeView): string {
  if (view.wireBytes == null) return "—";
  return view.decodedBytes != null
    ? `${fmtBytes(view.wireBytes)} / ${fmtBytes(view.decodedBytes)}`
    : fmtBytes(view.wireBytes);
}

/** `fmtBytes`, or an em dash when the size is absent (no body on that side). */
export function fmtBytesOrDash(n: number | null | undefined): string {
  return n == null ? "—" : fmtBytes(n);
}

/**
 * Live protocol sniffers — replace the scaffold's `x.protocol` discriminant, which
 * the runtime model doesn't carry. SSE is detected from the response content type;
 * a bulk operation (Elasticsearch `_msearch`/`_mget`) from the request URI.
 */
export function isSSEExchange(ex: Exchange): boolean {
  return (
    ex.responseBody?.contentType
      ?.toLowerCase()
      .startsWith("text/event-stream") ?? false
  );
}

/** True for an Elasticsearch bulk operation (`_msearch`/`_mget`). */
export function isMsearchExchange(ex: Exchange): boolean {
  return isBulkOperation(ex.uri);
}
