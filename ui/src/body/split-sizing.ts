// Auto-sizing heuristic for the request/response body split (PRO-422).
//
// Pure logic only — no React, no DOM. Computes the request pane's default
// percentage width based on body content and view mode.

import type { BodyState } from "@ui/state/reducer";
import type { ViewMode } from "./view-modes";

/** Minimum pane size as a percentage. Neither pane can be smaller than this. */
export const BODY_SPLIT_MIN_PCT = 15;

/** Byte threshold below which a body is considered "trivially small". */
const TRIVIAL_BYTES = 100;

/**
 * Only skew the split when one side has more than this fraction of the
 * combined max line length — avoids unnecessary skewing for small differences.
 */
const SKEW_THRESHOLD = 0.6;

/**
 * Whether a body would default to text view mode. True when:
 * - viewMode is explicitly "text", OR
 * - viewMode is null (default) AND the content type is a plain text type that
 *   defaults to text view (text/* excluding event-stream, html, xml — those
 *   have richer dedicated modes).
 *
 * Keep in sync with the actual default-mode selection in BodyPane/useDecodeBody:
 * if a new content type gains a dedicated renderer, add it to the exclusion list
 * here so the split heuristic doesn't over-allocate space for it.
 */
export function isTextMode(
  body: BodyState | undefined,
  viewMode: ViewMode | null,
): boolean {
  if (viewMode === "text") return true;
  if (viewMode !== null) return false;
  const ct = body?.contentType?.toLowerCase();
  if (ct == null) return false;
  const base = ct.split(";")[0].trim();
  if (!base.startsWith("text/")) return false;
  if (base === "text/event-stream") return false;
  if (base === "text/html") return false;
  if (base === "text/xml") return false;
  return true;
}

/**
 * Maximum line length among the first `limit` bytes of body chunk text.
 * Binary chunks are skipped — they don't have meaningful lines.
 */
export function maxLineLength(
  body: BodyState | undefined,
  limit: number,
): number {
  if (body == null) return 0;
  let maxLen = 0;
  let lineLen = 0;
  let bytesRead = 0;
  for (const chunk of body.chunks) {
    if (bytesRead >= limit) break;
    if (!("text" in chunk)) continue;
    for (const char of chunk.text) {
      if (char === "\n") {
        if (lineLen > maxLen) maxLen = lineLen;
        lineLen = 0;
      } else {
        lineLen++;
      }
      bytesRead++;
      if (bytesRead >= limit) break;
    }
  }
  if (lineLen > maxLen) maxLen = lineLen;
  return maxLen;
}

/**
 * Computes the default split percentage for the request pane (0–100).
 *
 * The heuristic only applies when at least one side is in text mode — tree,
 * hex, and other modes use horizontal space uniformly and benefit from 50/50.
 *
 * Within text mode:
 * 1. Empty/absent body → collapse that side to BODY_SPLIT_MIN_PCT.
 * 2. Trivially small body (< TRIVIAL_BYTES) → give it 25%, the other 75%.
 * 3. Both sides have real content → skew by max-line-length ratio, but only
 *    when the ratio is significantly asymmetric.
 */
export function computeBodySplitPercent(
  requestBody: BodyState | undefined,
  responseBody: BodyState | undefined,
  requestViewMode: ViewMode | null,
  responseViewMode: ViewMode | null,
): number {
  const reqIsText = isTextMode(requestBody, requestViewMode);
  const resIsText = isTextMode(responseBody, responseViewMode);

  if (!reqIsText && !resIsText) return 50;

  const reqEmpty = requestBody == null || requestBody.wireBytes === 0;
  const resEmpty = responseBody == null || responseBody.wireBytes === 0;

  if (reqEmpty && resEmpty) return 50;
  if (reqEmpty) return BODY_SPLIT_MIN_PCT;
  if (resEmpty) return 100 - BODY_SPLIT_MIN_PCT;

  const reqTrivial = requestBody.wireBytes < TRIVIAL_BYTES;
  const resTrivial = responseBody.wireBytes < TRIVIAL_BYTES;
  if (reqTrivial && !resTrivial) return 25;
  if (resTrivial && !reqTrivial) return 75;

  const reqMax = maxLineLength(requestBody, 4096);
  const resMax = maxLineLength(responseBody, 4096);
  const total = reqMax + resMax;
  if (total === 0) return 50;

  const reqShare = reqMax / total;
  if (reqShare > 1 - SKEW_THRESHOLD && reqShare < SKEW_THRESHOLD) return 50;

  return Math.min(
    100 - BODY_SPLIT_MIN_PCT,
    Math.max(BODY_SPLIT_MIN_PCT, Math.round(reqShare * 100)),
  );
}
