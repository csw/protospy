import type { SSEEvent } from "@ui/body/sse";
import type { BodyState } from "@ui/state/reducer";

/**
 * O2 classification seam (`UI/v2.3/body-interface-design.md` §6). Classifies a live
 * {@link SSEEvent} into a render class. One variant today (`"generic"`); the
 * discriminant is the extension point for future per-event-type rendering
 * (PRO-265 structured proxy events; PRO-196/197 LLM stream rendering) and must not
 * preclude the relative `+Nms` offsets deferred to PRO-152. It classifies the live
 * `SSEEvent` shape directly — the `SSEEvent → StreamEvent` field-rename map is
 * eliminated.
 */
export type EventClass = { kind: "generic" };

export function classifyEvent(event: SSEEvent): EventClass {
  // Future render classes discriminate on the event type (PRO-265 structured proxy
  // events; PRO-196/197 LLM stream rendering); every live event classifies as
  // "generic" today regardless of type.
  switch (event.type) {
    default:
      return { kind: "generic" };
  }
}

/**
 * The provisional `EventStreamBody` view (`body-interface-design.md` §3, S1/O2) the
 * stream pane consumes. It reads the live `BodyState.sseState` directly rather than
 * letting components reach into the reducer shape.
 *
 * Per "represent all, build a subset" (§4), only the facets with a real producer and
 * consumer today are surfaced: the parsed `events`, the eviction-surviving
 * `totalEventCount`, and the `active → ended` lifecycle fact (`atEnd`). The design
 * doc's `Fidelity`, `Sizes`, and `endKind` (truncated vs. complete) are specified
 * there and slot in when their producers land; the indicator currently derives
 * complete/disconnected from `atEnd` plus the exchange error via `deriveStreamState`.
 */
export interface EventStreamBody {
  events: SSEEvent[];
  totalEventCount: number;
  /** `false` while the stream is still active; `true` once the body has ended. */
  atEnd: boolean;
}

export function readEventStream(body: BodyState | undefined): EventStreamBody {
  const events = body?.sseState?.events ?? [];
  return {
    events,
    totalEventCount: body?.sseState?.totalEventCount ?? events.length,
    atEnd: body?.atEnd ?? true,
  };
}
