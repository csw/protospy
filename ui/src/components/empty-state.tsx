// src/components/protospy/empty-state.tsx
// The list's empty states (mapping.md → List panel). First-run gets a hint
// that traffic populates the list; the filtered variant is a terse no-match;
// the connecting variant signals that the proxy connection is being established
// (distinguishable from the truly-empty connected state).
// Copy is intentionally minimal — exact wording is app-tunable.

import { Radio, Zap } from "lucide-react";

import { cn } from "@ui/lib/utils";

export interface EmptyStateProps {
  kind?: "first-run" | "filtered" | "connecting";
  className?: string;
}

export function EmptyState({ kind = "first-run", className }: EmptyStateProps) {
  if (kind === "connecting") {
    return (
      <div
        data-testid="connecting-state"
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 p-10 text-center",
          className,
        )}
      >
        <span className="mb-1 inline-flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Radio className="size-5 animate-pulse" />
        </span>
        <span className="text-sm font-semibold text-foreground">
          Connecting to proxy…
        </span>
      </div>
    );
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
