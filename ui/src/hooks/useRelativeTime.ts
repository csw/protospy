import { useEffect, useState } from "react";
import { formatRelative } from "@ui/lib/utils";

export function useRelativeTime(timestamp: string): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return formatRelative(timestamp, now);
}
