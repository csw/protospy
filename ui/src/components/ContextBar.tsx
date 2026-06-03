import { ChevronLeft, ChevronRight, Copy, ExternalLink } from "lucide-react";
import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/reducer";
import {
  cn,
  parseQueryParams,
  shortenTraceId,
  splitUri,
  statusTextClass,
  traceColor,
} from "@ui/lib/utils";
import { MethodBadge } from "./ui/MethodBadge";
import { SimpleTooltip } from "./ui/SimpleTooltip";

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
    <div
      className={cn(
        "flex items-center gap-2 px-3 bg-bg-pane border-b border-border shrink-0 overflow-hidden",
        height,
      )}
    >
      {/* Prev/Next navigation */}
      <div className="flex items-center gap-0.5 shrink-0">
        <SimpleTooltip content="Previous exchange">
          <button
            onClick={() => prevId != null && setSelectedId(prevId)}
            disabled={prevId == null}
            className="w-[26px] h-[26px] flex items-center justify-center rounded text-mid hover:text-ink transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="Previous exchange"
          >
            <ChevronLeft size={16} />
          </button>
        </SimpleTooltip>
        <SimpleTooltip content="Next exchange">
          <button
            onClick={() => nextId != null && setSelectedId(nextId)}
            disabled={nextId == null}
            className="w-[26px] h-[26px] flex items-center justify-center rounded text-mid hover:text-ink transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="Next exchange"
          >
            <ChevronRight size={16} />
          </button>
        </SimpleTooltip>
      </div>

      {/* Method badge */}
      <MethodBadge method={method} size="md" />

      {/* Path + query params */}
      <div className="flex items-center gap-0 font-family-mono text-ctx-path flex-1 overflow-hidden min-w-0">
        <SimpleTooltip content={uri} side="bottom">
          <span className="flex items-center gap-0 overflow-hidden min-w-0">
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
          </span>
        </SimpleTooltip>
        {/* Next matching button */}
        {nextMatchingId != null && (
          <SimpleTooltip content="Next exchange with same method + path">
            <button
              onClick={() => setSelectedId(nextMatchingId)}
              className="w-4 h-4 flex items-center justify-center rounded text-dim hover:text-ink transition-colors cursor-pointer shrink-0 ml-1 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Next matching exchange"
            >
              <ChevronRight size={14} />
            </button>
          </SimpleTooltip>
        )}
      </div>

      {/* Status display */}
      {hasStatus && exchange.status != null && (
        <span
          className={cn(
            "font-family-mono text-ui-sm font-semibold shrink-0",
            statusTextClass(exchange.status),
          )}
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
      {hasError && (
        <SimpleTooltip content={exchange.error?.message} side="bottom">
          <span
            data-testid="error-indicator"
            className="font-family-mono text-ui-sm font-semibold text-red shrink-0"
          >
            Error
          </span>
        </SimpleTooltip>
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
          className="flex items-center gap-1 border border-border rounded-full px-2 h-5 shrink-0"
          style={{ borderColor: traceColor(traceId) }}
        >
          {/* Clickable swatch + trace ID — "Filter by trace" tooltip here only */}
          <SimpleTooltip content="Filter by trace">
            <button
              onClick={() => setTraceFilter(traceId)}
              className="flex items-center gap-1 rounded-full cursor-pointer focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Filter by trace"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: traceColor(traceId) }}
              />
              <span className="font-family-mono text-xs text-ink-2">
                {shortTrace}
              </span>
            </button>
          </SimpleTooltip>
          {/* Copy trace ID */}
          <SimpleTooltip content="Copy trace ID">
            <button
              onClick={copyTraceId}
              className="w-4 h-4 flex items-center justify-center rounded text-dim hover:text-ink transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Copy trace ID"
            >
              <Copy size={12} />
            </button>
          </SimpleTooltip>
          {/* Open in Jaeger (placeholder) */}
          <SimpleTooltip content="Jaeger integration coming soon">
            <button
              disabled
              className="w-4 h-4 flex items-center justify-center rounded text-dim transition-colors disabled:opacity-30 disabled:cursor-default focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Open in Jaeger"
            >
              <ExternalLink size={12} />
            </button>
          </SimpleTooltip>
          {/* Next in trace */}
          {nextInTraceId != null && (
            <SimpleTooltip content="Next in trace">
              <button
                onClick={() => setSelectedId(nextInTraceId)}
                className="w-4 h-4 flex items-center justify-center rounded text-dim hover:text-ink transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                aria-label="Next exchange in trace"
              >
                <ChevronRight size={12} />
              </button>
            </SimpleTooltip>
          )}
        </div>
      )}
    </div>
  );
}
