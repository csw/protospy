// src/components/protospy/empty-state.tsx
// The list's empty states (mapping.md → List panel). First-run gets a hint
// that traffic populates the list; the filtered variant is a terse no-match;
// the connecting variant shows skeleton rows while the proxy connection is
// being established (distinguishable from the truly-empty connected state).
// Copy is intentionally minimal — exact wording is app-tunable.

import { Zap } from "lucide-react";

import { cn } from "@ui/lib/utils";
import { useDensity } from "@ui/lib/density";
import { Skeleton } from "@ui/components/ui/skeleton";

export interface EmptyStateProps {
  kind?: "first-run" | "filtered" | "connecting";
  className?: string;
}

// Varied path-column widths so the skeleton rows look like real traffic,
// not a uniform repeating pattern.
const PATH_WIDTHS = [
  "w-2/5",
  "w-3/5",
  "w-1/2",
  "w-3/4",
  "w-2/5",
  "w-1/2",
  "w-3/5",
  "w-2/3",
] as const;

function ConnectingSkeletonList({ className }: { className?: string }) {
  const { rowPx } = useDensity();
  return (
    <div
      data-testid="connecting-skeleton"
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}
    >
      {PATH_WIDTHS.map((pathWidth, i) => (
        <div
          key={i}
          className="flex items-center gap-2 border-b px-3"
          style={{ height: rowPx.row }}
        >
          <Skeleton className="h-4 w-10 shrink-0" />
          <Skeleton className="h-4 w-8 shrink-0" />
          <Skeleton className={cn("h-4 shrink", pathWidth)} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ kind = "first-run", className }: EmptyStateProps) {
  if (kind === "connecting") {
    return <ConnectingSkeletonList className={className} />;
  }
  if (kind === "filtered") {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center p-10 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        No requests match your filter
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 p-10 text-center",
        className,
      )}
    >
      <span className="mb-1 inline-flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Zap className="size-5" />
      </span>
      <span className="text-sm font-semibold text-foreground">
        No requests yet
      </span>
      <span className="text-sm text-muted-foreground">
        Requests appear here as traffic flows through the proxy.
      </span>
    </div>
  );
}
