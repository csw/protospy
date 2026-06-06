import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@ui/lib/utils";
import { Button } from "./ui/button";

interface Props {
  text?: string;
  /**
   * `"label"` (default) renders a "Copy"/"Copied!" text affordance (body head);
   * `"icon"` renders an icon-only Copy→Check affordance (per-row, headers).
   */
  mode?: "label" | "icon";
  /** Required for `mode="icon"` (icon-only buttons need an accessible name). */
  "aria-label"?: string;
  className?: string;
}

/**
 * The single copy affordance + success signal, on `Button variant="link"
 * size="xs"`, resting `dim` (design-system §4). Self-manages its 2s "copied"
 * window, so each call site is just `<CopyButton text=… />`.
 */
export function CopyButton({
  text,
  mode = "label",
  "aria-label": ariaLabel,
  className,
}: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  function handleClick() {
    if (text == null) return;
    navigator.clipboard.writeText(text).catch(() => {
      setCopied(false);
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    });
    setCopied(true);
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant="link"
      size="xs"
      onClick={handleClick}
      disabled={!text}
      aria-label={ariaLabel}
      className={cn(
        "h-auto font-mono text-xs text-dim transition-colors hover:text-ink hover:no-underline disabled:text-dim disabled:opacity-50",
        mode === "icon" && "p-0",
        className,
      )}
    >
      {mode === "icon" ? (
        copied ? (
          <Check className="text-green" />
        ) : (
          <Copy />
        )
      ) : copied ? (
        "Copied!"
      ) : (
        "Copy"
      )}
    </Button>
  );
}
