import { useEffect, useState } from "react";
import { formatRelative } from "@ui/lib/utils";
import { subscribe } from "@ui/lib/tickSource";

export function useRelativeTime(timestamp: string): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    return subscribe(setNow);
  }, []);

  return formatRelative(timestamp, now);
}
