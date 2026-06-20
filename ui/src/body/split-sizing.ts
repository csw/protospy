// Initial sizing for the request/response body split (PRO-422, PRO-432).
//
// Pure logic only — no React, no DOM. Computes the request pane's default
// percentage width from what is known the moment the exchange's Request event
// arrives, so the initial layout is deterministic and never races against body
// data that streams in asynchronously after the panel group mounts.

import type { BodyState } from "@ui/state/types";

/** Minimum pane size as a percentage. Neither pane can be smaller than this. */
export const BODY_SPLIT_MIN_PCT = 15;

/**
 * Computes the default split percentage for the request pane (0–100).
 *
 * The rule depends only on whether the request has a body — a fact the reducer
 * records synchronously from the Request event (`requestBody` is `undefined`
 * for a body-less request), independent of any streaming chunk data:
 *
 * - **No request body** (e.g. a GET): collapse the request pane to
 *   `BODY_SPLIT_MIN_PCT` so the response — the high-value content — gets the
 *   rest. This is the common case.
 * - **Request body present** (any size): split 50/50.
 *
 * The user can drag to adjust from either default.
 */
export function computeBodySplitPercent(
  requestBody: BodyState | undefined,
): number {
  return requestBody == null ? BODY_SPLIT_MIN_PCT : 50;
}
