import { cn } from "@ui/lib/utils";

export type StreamState = "live" | "paused" | "complete" | "disconnected";

/**
 * Derive the stream indicator state from exchange/stream properties.
 *
 * Priority: `atEnd` (complete) wins over error (disconnected), which wins
 * over scroll position (live/paused). The `atEnd`-first priority is
 * intentional: the Rust proxy only sets `atEnd` on a clean transport close.
 * A mid-stream upstream disconnect emits an Error event but leaves `atEnd`
 * false, so `disconnected` is the correct terminal state for that case. If
 * the proxy *does* cleanly close the body after an error (e.g. it synthesises
 * trailers), `atEnd` becomes true and "complete" is appropriate — the stream
 * did finish from the transport's perspective.
 */
export function deriveStreamState(
  atEnd: boolean,
  isFollowing: boolean,
  exchangeError?: { direction: "Request" | "Response"; message: string },
): StreamState {
  const hasResponseError = exchangeError?.direction === "Response";
  if (hasResponseError && !atEnd) return "disconnected";
  if (atEnd) return "complete";
  if (isFollowing) return "live";
  return "paused";
}

const INDICATOR_CONFIG: Record<
  StreamState,
  { dot: string; text: string; label: string }
> = {
  disconnected: { dot: "bg-red", text: "text-red", label: "disconnected" },
  complete: { dot: "bg-mid", text: "text-mid", label: "complete" },
  live: {
    dot: "bg-green motion-safe:animate-pulse",
    text: "text-green",
    label: "live",
  },
  paused: { dot: "bg-amber", text: "text-amber", label: "paused" },
};

interface Props {
  state: StreamState;
}

/**
 * Four-state live indicator used in SSE stream views.
 * Pure display component — callers derive the state via `deriveStreamState`.
 */
export function LiveIndicator({ state }: Props) {
  const { dot, text, label } = INDICATOR_CONFIG[state];

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span
        data-testid="indicator-dot"
        className={cn("inline-block w-[7px] h-[7px] rounded-full", dot)}
      />
      <span className={cn("text-xs", text)}>{label}</span>
    </div>
  );
}
