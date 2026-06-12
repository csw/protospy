import { Radio, Zap } from "lucide-react";

import { cn } from "@ui/lib/utils";

export interface EmptyStateProps {
  kind?: "first-run" | "filtered" | "connecting";
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

  const connecting = kind === "connecting";
  return (
    <div
      role={connecting ? "status" : undefined}
      data-testid={connecting ? "connecting-state" : undefined}
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 p-10 text-center",
        className,
      )}
    >
      <span
        className={cn(
          "mb-1 inline-flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground",
          connecting && "motion-safe:animate-pulse",
        )}
      >
        {connecting ? (
          <Radio className="size-5" aria-hidden />
        ) : (
          <Zap className="size-5" aria-hidden />
        )}
      </span>
      <span className="text-sm font-semibold text-foreground">
        {connecting ? "Connecting to proxy…" : "No requests yet"}
      </span>
      {!connecting && (
        <span className="text-sm text-muted-foreground">
          Requests appear here as traffic flows through the proxy.
        </span>
      )}
    </div>
  );
}
