import { cn } from "@ui/lib/utils";

/**
 * The shared empty-state text treatment — colour, font, transform, tracking.
 * Size is applied per call (default `text-xs`). This base is the single
 * source of truth for how empty-state copy looks, so non-cmdk regions
 * (`EmptyState` below) and cmdk's `CommandEmpty` can share the *look* without
 * sharing a wrapper component (design-system §3.2; the two live on different
 * axes — presentation vs. cmdk filter-driven visibility).
 */
const EMPTY_STATE_BASE =
  "text-muted-foreground font-sans uppercase tracking-widest";

/** Default (xs) empty-state text treatment for callers that own their own
 *  layout — e.g. the command palette's `CommandEmpty` children. */
export const emptyStateText = cn(EMPTY_STATE_BASE, "text-xs");

interface Props {
  children: React.ReactNode;
  textSize?: "xs" | "sm";
}

export function EmptyState({ children, textSize = "xs" }: Props) {
  return (
    <div className="flex items-center justify-center h-full">
      <span
        className={cn(
          EMPTY_STATE_BASE,
          textSize === "xs" ? "text-xs" : "text-ui",
        )}
      >
        {children}
      </span>
    </div>
  );
}
