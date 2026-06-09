// src/components/protospy/trace-tag.tsx
// The trace pill: swatch + truncated id + inline actions (copy / open-in-Jaeger /
// next-in-trace). Clicking the body filters the list to the trace. Root info and
// the Jaeger URL are config-dependent and load async — pass jaegerHref when known.

import { Copy, ExternalLink, ChevronRight } from "lucide-react";
import { cn } from "@ui/lib/utils";
import { traceColorVar, shortTraceId } from "@ui/lib/tokens";
import { Button } from "@ui/components/ui/button";

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
      {/* The pill body is itself the filter trigger; use Button (for focus ring /
          disabled / svg handling) but strip its box styling so it stays an inline
          run of pill text. */}
      <Button
        variant="ghost"
        onClick={onFilter}
        aria-label="Filter by trace"
        className="inline-flex h-auto items-center gap-1.5 rounded-full px-0 py-0 font-mono text-xs text-muted-foreground hover:bg-transparent hover:text-secondary-foreground"
      >
        {/* dynamic per-trace color → inline var() is the right call here */}
        <span
          className="size-2 rounded-full"
          style={{ background: traceColorVar(traceId) }}
          aria-hidden
        />
        trace {shortTraceId(traceId)}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onCopy}
        aria-label="Copy trace id"
        className="text-muted-foreground hover:text-primary"
      >
        <Copy className="size-3" />
      </Button>
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
      {onNext && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onNext}
          aria-label="Next in trace"
          className="text-muted-foreground hover:text-primary"
        >
          <ChevronRight className="size-3" />
        </Button>
      )}
    </span>
  );
}
