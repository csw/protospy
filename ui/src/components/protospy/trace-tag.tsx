// src/components/protospy/trace-tag.tsx
// The trace pill: swatch + truncated id + inline actions (copy / open-in-Jaeger /
// next-in-trace). Clicking the body filters the list to the trace. Root info and
// the Jaeger URL are config-dependent and load async — pass jaegerHref when known.

"use client";

import { Copy, ExternalLink, ChevronRight } from "lucide-react";
import { cn } from "@ui/lib/utils";
import { traceColorVar, shortTraceId } from "@ui/lib/tokens";

export interface TraceTagProps {
  traceId: string;
  onFilter?: () => void;
  onCopy?: () => void;
  onNext?: () => void;
  jaegerHref?: string;
  className?: string;
}

export function TraceTag({
  traceId,
  onFilter,
  onCopy,
  onNext,
  jaegerHref,
  className,
}: TraceTagProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-2 py-0.5",
        "font-mono text-xs text-muted-foreground hover:border-border-strong",
        className,
      )}
    >
      <button
        type="button"
        onClick={onFilter}
        aria-label="Filter by trace"
        className="inline-flex items-center gap-1.5 hover:text-secondary-foreground"
      >
        {/* dynamic per-trace color → inline var() is the right call here */}
        <span
          className="size-2 rounded-full"
          style={{ background: traceColorVar(traceId) }}
          aria-hidden
        />
        trace {shortTraceId(traceId)}
      </button>
      <button
        type="button"
        onClick={onCopy}
        className="text-muted-foreground hover:text-primary"
        aria-label="Copy trace id"
      >
        <Copy className="size-3" />
      </button>
      {jaegerHref && (
        <a
          href={jaegerHref}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-primary"
          aria-label="Open in Jaeger"
        >
          <ExternalLink className="size-3" />
        </a>
      )}
      <button
        type="button"
        onClick={onNext}
        className="text-muted-foreground hover:text-primary"
        aria-label="Next in trace"
      >
        <ChevronRight className="size-3" />
      </button>
    </span>
  );
}
