// src/components/protospy/body-state.tsx
// Lifecycle-aware body placeholder (design-system §4.5): body panes are never a
// flat "pending". `awaiting` = no status/headers yet (awaiting the response);
// `streaming` = response started, body still arriving. Used symmetrically on the
// request/response panes; the `complete` phase renders the real JSON viewer, not
// this. Maps a BodyState phase to the right copy + treatment.

import { cn } from "@ui/lib/utils";
import type { BodyState as BodyStatePhase } from "@ui/lib/types";

const COPY: Record<Exclude<BodyStatePhase["phase"], "complete">, string> = {
  awaiting: "Awaiting response…",
  streaming: "Receiving body…",
};

export interface BodyStateProps {
  state: BodyStatePhase;
  className?: string;
}

export function BodyState({ state, className }: BodyStateProps) {
  if (state.phase === "complete") return null; // real body renders elsewhere
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 p-7 font-mono text-sm text-muted-foreground",
        className,
      )}
    >
      <span
        className="size-3 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none"
        aria-hidden
      />
      {COPY[state.phase]}
    </div>
  );
}
