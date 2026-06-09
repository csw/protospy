// src/components/protospy/empty-state.tsx
// The list's two empty states (mapping.md → List panel). First-run gets a hint
// that traffic populates the list; the filtered variant is a terse no-match.
// Copy is intentionally minimal — exact wording is app-tunable.

import { Zap } from "lucide-react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  kind?: "first-run" | "filtered";
  className?: string;
}

export function EmptyState({ kind = "first-run", className }: EmptyStateProps) {
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
