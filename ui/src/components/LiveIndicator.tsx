interface Props {
  /** Whether the stream has ended. Takes priority over isFollowing. */
  atEnd: boolean;
  /** Whether the scroll view is following the bottom of the stream. */
  isFollowing: boolean;
}

/**
 * Three-state live indicator used in SSE stream views.
 *
 * - live: stream open, user at scroll edge (green pulsing dot)
 * - paused: stream open, user scrolled away (amber dot)
 * - complete: stream ended (gray dot)
 */
export function LiveIndicator({ atEnd, isFollowing }: Props) {
  const dotClass = atEnd
    ? "bg-mid"
    : isFollowing
      ? "bg-green-500 animate-pulse"
      : "bg-amber-500";

  const textClass = atEnd
    ? "text-mid"
    : isFollowing
      ? "text-green-500"
      : "text-amber-500";

  const label = atEnd ? "complete" : isFollowing ? "live" : "paused";

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span
        data-testid="indicator-dot"
        className={`inline-block w-[7px] h-[7px] rounded-full ${dotClass}`}
      />
      <span className={`text-xs ${textClass}`}>{label}</span>
    </div>
  );
}
