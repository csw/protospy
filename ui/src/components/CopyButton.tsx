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
 * The single copy affordance + success signal, resting `dim`
 * (design-system §4). Self-manages its 2s "copied" window, so each call site
 * is just `<CopyButton text=… />`.
 *
 * `mode="label"` renders inline text on `Button variant="link" size="xs"`;
 * `mode="icon"` renders an icon-only square on `variant="ghost"
 * size="icon-2xs"` — the honest 16px icon-button variant (no padding class),
 * matching the SearchInput / trace-chip clear buttons rather than overriding a
 * text-sized variant back down.
 */
export function CopyButton({
  text,
  mode = "label",
  "aria-label": ariaLabel,
  className,
}: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIcon = mode === "icon";

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
      variant={isIcon ? "ghost" : "link"}
      size={isIcon ? "icon-2xs" : "xs"}
      onClick={handleClick}
      disabled={!text}
      aria-label={ariaLabel}
      className={cn(
        "font-mono text-dim transition-colors hover:text-ink disabled:text-dim disabled:opacity-50",
        // Label mode is inline text on the link variant: content-height plus
        // underline suppression. Icon mode keeps the icon-2xs square (size-4),
        // so it must NOT pick up h-auto (which would collapse the fixed height).
        !isIcon && "h-auto text-xs hover:no-underline",
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
