import { cn } from "@ui/lib/utils";

interface Props {
  /** Whether the stream has ended. Takes priority over isFollowing. */
  atEnd: boolean;
  /** Whether the scroll view is following the bottom of the stream. */
  isFollowing: boolean;
  /** Whether the exchange has an error (e.g. mid-stream disconnect). */
  hasError?: boolean;
}

/**
 * Four-state live indicator used in SSE stream views.
 *
 * - disconnected: stream terminated by error (red dot) — takes priority over live/paused
 * - live: stream open, user at scroll edge (green pulsing dot)
 * - paused: stream open, user scrolled away (amber dot)
 * - complete: stream ended normally (gray dot)
 */
export function LiveIndicator({ atEnd, isFollowing, hasError }: Props) {
  // Error on a non-ended stream means abnormal termination
  const disconnected = hasError === true && !atEnd;

  const dotClass = disconnected
    ? "bg-red"
    : atEnd
      ? "bg-mid"
      : isFollowing
        ? "bg-green animate-pulse"
        : "bg-amber";

  const textClass = disconnected
    ? "text-red"
    : atEnd
      ? "text-mid"
      : isFollowing
        ? "text-green"
        : "text-amber";

  const label = disconnected
    ? "disconnected"
    : atEnd
      ? "complete"
      : isFollowing
        ? "live"
        : "paused";

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span
        data-testid="indicator-dot"
        className={cn("inline-block w-[7px] h-[7px] rounded-full", dotClass)}
      />
      <span className={cn("text-xs", textClass)}>{label}</span>
    </div>
  );
}
