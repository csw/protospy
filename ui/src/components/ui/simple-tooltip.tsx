import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

interface SimpleTooltipProps {
  /** Tooltip content. When falsy, children render unwrapped. */
  content: ReactNode;
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * Thin convenience wrapper around Radix/shadcn Tooltip.
 *
 * Renders a Tooltip around `children` when `content` is truthy;
 * otherwise renders children unwrapped (no DOM overhead).
 *
 * Requires a `TooltipProvider` ancestor (provided in `App.tsx`).
 */
export function SimpleTooltip({ content, children, side }: SimpleTooltipProps) {
  if (!content) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-[500px] break-all">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
