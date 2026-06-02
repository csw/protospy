import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

interface StreamFollowResult {
  isFollowing: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  jumpToLatest: () => void;
}

/**
 * Shared scroll-follow logic for SSE stream views. Auto-scrolls to the
 * bottom when following, pauses when the user scrolls away (40px threshold),
 * and provides a jump-to-latest callback.
 *
 * @param deps — values that trigger an auto-scroll when they change (e.g.
 *               `[events.length]`). The caller decides what constitutes
 *               "new content".
 */
export function useStreamFollow(deps: unknown[]): StreamFollowResult {
  const [isFollowing, setIsFollowing] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isFollowing) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFollowing, ...deps]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsFollowing(distFromBottom < 40);
  }, []);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setIsFollowing(true);
  }, []);

  return { isFollowing, scrollRef, handleScroll, jumpToLatest };
}
