import { ChevronLeft, ChevronRight, Copy, ExternalLink } from "lucide-react";
import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/reducer";
import {
  parseQueryParams,
  shortenTraceId,
  splitUri,
  statusTextClass,
  traceColor,
} from "@ui/lib/utils";
import { MethodBadge } from "./ui/MethodBadge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

interface Props {
  exchange: Exchange;
  ordered: Exchange[];
  currentIdx: number;
}

export function ContextBar({ exchange, ordered, currentIdx }: Props) {
  const setSelectedId = useStore((s) => s.setSelectedId);
  const setTraceFilter = useStore((s) => s.setTraceFilter);
  const density = useStore((s) => s.density);

  const method = exchange.method ?? "?";
  const uri = exchange.uri ?? "/";

  // Path + query params
  const { path: pathOnly } = splitUri(uri);
  const queryParams = parseQueryParams(uri);

  // Prev/next in filtered+ordered list
  const prevId = currentIdx > 0 ? (ordered[currentIdx - 1]?.id ?? null) : null;
  const nextId =
    currentIdx < ordered.length - 1
      ? (ordered[currentIdx + 1]?.id ?? null)
      : null;

  // Next matching (same method + path, ignoring query)
  function findNextMatching(): number | null {
    for (let i = currentIdx + 1; i < ordered.length; i++) {
      const ex = ordered[i];
      if (
        ex.method === method &&
        ex.uri != null &&
        splitUri(ex.uri).path === pathOnly
      ) {
        return ex.id;
      }
    }
    return null;
  }

  // Next in trace
  function findNextInTrace(): number | null {
    if (!exchange.traceId) return null;
    for (let i = currentIdx + 1; i < ordered.length; i++) {
      if (ordered[i].traceId === exchange.traceId) {
        return ordered[i].id;
      }
    }
    return null;
  }

  const nextMatchingId = findNextMatching();
  const nextInTraceId = findNextInTrace();

  const height = density === "compact" ? "h-10" : "h-[50px]";

  // Status display
  const hasStatus = exchange.status != null;
  const hasError = exchange.error != null;

  // Trace pill helpers
  const traceId = exchange.traceId;
  const shortTrace = traceId != null ? shortenTraceId(traceId) : "";

  function copyTraceId() {
    if (traceId == null) return;
    void navigator.clipboard.writeText(traceId);
  }

  return (
    <TooltipProvider>
      <div
        className={`flex items-center gap-2 px-3 ${height} bg-bg-pane border-b border-border shrink-0 overflow-hidden`}
      >
        {/* Prev/Next navigation */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => prevId != null && setSelectedId(prevId)}
            disabled={prevId == null}
            className="w-[26px] h-[26px] flex items-center justify-center rounded text-mid hover:text-ink transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
            aria-label="Previous exchange"
            title="Previous exchange"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => nextId != null && setSelectedId(nextId)}
            disabled={nextId == null}
            className="w-[26px] h-[26px] flex items-center justify-center rounded text-mid hover:text-ink transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
            aria-label="Next exchange"
            title="Next exchange"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Method badge */}
        <MethodBadge method={method} size="md" />

        {/* Path + query params */}
        <div className="flex items-center gap-0 font-family-mono text-ctx-path flex-1 overflow-hidden min-w-0">
          <span className="text-ink truncate shrink-0 max-w-[40%]">
            {pathOnly}
          </span>
          {queryParams.length > 0 && (
            <>
              <span className="text-dim shrink-0">?</span>
              <span className="flex items-center gap-0 overflow-hidden truncate">
                {queryParams.map(({ key, value }, i) => (
                  <span key={i} className="shrink-0">
                    {i > 0 && <span className="text-dim">&amp;</span>}
                    <span className="text-accent-ink">{key}</span>
                    <span className="text-dim">=</span>
                    <span className="text-ink-2">{value}</span>
                  </span>
                ))}
              </span>
            </>
          )}
          {/* Next matching button */}
          {nextMatchingId != null && (
            <button
              onClick={() => setSelectedId(nextMatchingId)}
              className="w-4 h-4 flex items-center justify-center rounded text-dim hover:text-ink transition-colors cursor-pointer shrink-0 ml-1"
              aria-label="Next matching exchange"
              title="Next exchange with same method + path"
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {/* Status display */}
        {hasStatus && exchange.status != null && (
          <span
            className={`font-family-mono text-ui-sm font-semibold shrink-0 ${statusTextClass(exchange.status)}`}
          >
            {exchange.status}
          </span>
        )}
        {!hasStatus && !hasError && (
          <span className="flex items-center gap-1.5 shrink-0 text-amber font-family-mono text-ui-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
            pending
          </span>
        )}
        {hasError && exchange.error != null && (
          <span
            data-testid="error-display"
            className="flex items-center gap-1.5 shrink-0 min-w-0 text-red font-family-mono text-ui-xs"
            title={exchange.error.message}
          >
            <span className="font-semibold shrink-0">
              {hasStatus ? "Interrupted" : "Network error"}
            </span>
            <span className="truncate text-red/80 max-w-[40ch]">
              {exchange.error.message}
            </span>
          </span>
        )}

        {/* Elapsed pill */}
        {exchange.elapsedMs != null && (
          <span className="font-family-mono text-xs bg-bg-sub border border-border rounded-full px-2 h-5 flex items-center shrink-0">
            {exchange.elapsedMs}ms
          </span>
        )}

        {/* Trace pill */}
        {traceId != null && (
          <div
            className="flex items-center gap-1 border border-border rounded-full px-2 h-5 shrink-0 cursor-pointer"
            style={{ borderColor: traceColor(traceId) }}
            onClick={() => setTraceFilter(traceId)}
            title="Filter by trace"
          >
            {/* Color swatch */}
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: traceColor(traceId) }}
            />
            {/* Trace ID short */}
            <span className="font-family-mono text-xs text-ink-2">
              {shortTrace}
            </span>
            {/* Copy trace ID */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyTraceId();
              }}
              className="w-4 h-4 flex items-center justify-center text-dim hover:text-ink transition-colors cursor-pointer"
              aria-label="Copy trace ID"
              title="Copy trace ID"
            >
              <Copy size={12} />
            </button>
            {/* Open in Jaeger (placeholder) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 flex items-center justify-center text-dim hover:text-ink transition-colors cursor-pointer"
                  aria-label="Open in Jaeger"
                >
                  <ExternalLink size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Jaeger integration coming soon</TooltipContent>
            </Tooltip>
            {/* Next in trace */}
            {nextInTraceId != null && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(nextInTraceId);
                }}
                className="w-4 h-4 flex items-center justify-center text-dim hover:text-ink transition-colors cursor-pointer"
                aria-label="Next exchange in trace"
                title="Next in trace"
              >
                <ChevronRight size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
