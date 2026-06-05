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
import { Button } from "@ui/components/ui/button";
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
      {/* Note: the `rounded` (4px) on these icon Buttons intentionally
          overrides icon-xs's `rounded-md` (6px) to match the control spec;
          `disabled:pointer-events-auto` re-enables hover so the tooltip still
          shows on disabled controls (Button's base sets pointer-events-none).
          `hover:bg-bg-hover dark:hover:bg-bg-hover` overrides the ghost
          variant's `hover:bg-accent` / `dark:hover:bg-accent/50` (which resolve
          to the brand blue here) with a neutral toolbar hover — the original
          hand-rolled controls had no accent hover. Both light and dark must be
          overridden; the dark hover is a separate class. The same override is
          applied to every active icon control below. */}
      <div className="flex items-center gap-0.5 shrink-0">
        <SimpleTooltip content="Previous exchange">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => prevId != null && setSelectedId(prevId)}
            disabled={prevId == null}
            className="size-[26px] rounded text-mid hover:bg-bg-hover dark:hover:bg-bg-hover hover:text-ink cursor-pointer disabled:opacity-30 disabled:pointer-events-auto disabled:cursor-default"
            aria-label="Previous exchange"
          >
            <ChevronLeft className="size-4" />
          </Button>
        </SimpleTooltip>
        <SimpleTooltip content="Next exchange">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => nextId != null && setSelectedId(nextId)}
            disabled={nextId == null}
            className="size-[26px] rounded text-mid hover:bg-bg-hover dark:hover:bg-bg-hover hover:text-ink cursor-pointer disabled:opacity-30 disabled:pointer-events-auto disabled:cursor-default"
            aria-label="Next exchange"
          >
            <ChevronRight className="size-4" />
          </Button>
        </SimpleTooltip>
      </div>

      {/* Method badge */}
      <MethodBadge method={method} size="md" />

      {/* Path + query params */}
      <div className="flex items-center gap-0 font-mono text-ctx-path flex-1 overflow-hidden min-w-0">
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
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setSelectedId(nextMatchingId)}
              className="size-4 rounded text-dim hover:bg-bg-hover dark:hover:bg-bg-hover hover:text-ink cursor-pointer ml-1"
              aria-label="Next matching exchange"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </SimpleTooltip>
        )}
      </div>

      {/* Status display */}
      {hasStatus && exchange.status != null && (
        <span
          className={cn(
            "font-mono text-ui-sm font-semibold shrink-0",
            statusTextClass(exchange.status),
          )}
        >
          {exchange.status}
        </span>
      )}
      {!hasStatus && !hasError && (
        <span className="flex items-center gap-1.5 shrink-0 text-amber font-mono text-ui-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
          pending
        </span>
      )}
      {hasError && (
        <SimpleTooltip content={exchange.error?.message} side="bottom">
          <span
            data-testid="error-indicator"
            className="font-mono text-ui-sm font-semibold text-red shrink-0"
          >
            Error
          </span>
        </SimpleTooltip>
      )}

      {/* Elapsed pill */}
      {exchange.elapsedMs != null && (
        <span className="font-mono text-xs bg-bg-sub border border-border rounded-full px-2 h-5 flex items-center shrink-0">
          {exchange.elapsedMs}ms
        </span>
      )}

      {/* Trace pill */}
      {traceId != null && (
        <div
          className="flex items-center gap-1 border border-border rounded-full px-2 h-5 shrink-0"
          style={{ borderColor: traceColor(traceId) }}
        >
          {/* Clickable swatch + trace ID — "Filter by trace" tooltip here only.
              Classified as a fire-once action, not a binary Toggle (PRO-294): it
              only *sets* the trace filter (never toggles it off) and carries no
              persistent pressed state — the filter is cleared from a separate
              control (FilterBar's "Clear trace filter" chip). So `Button`, not
              `Toggle`, is the correct primitive. */}
          <SimpleTooltip content="Filter by trace">
            {/* size="xs" (not icon-xs): this is a swatch + text pill, not an
                icon button. Override only what differs from the variant —
                content height, no padding, pill radius, no ghost hover bg
                (suppressed in both light and dark: the ghost variant sets
                `hover:bg-accent` and a separate `dark:hover:bg-accent/50`). */}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setTraceFilter(traceId)}
              className="h-auto rounded-full p-0 cursor-pointer hover:bg-transparent dark:hover:bg-transparent"
              aria-label="Filter by trace"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: traceColor(traceId) }}
              />
              <span className="font-mono text-xs text-ink-2">{shortTrace}</span>
            </Button>
          </SimpleTooltip>
          {/* Copy trace ID */}
          <SimpleTooltip content="Copy trace ID">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={copyTraceId}
              className="size-4 rounded text-dim hover:bg-bg-hover dark:hover:bg-bg-hover hover:text-ink cursor-pointer"
              aria-label="Copy trace ID"
            >
              <Copy className="size-3" />
            </Button>
          </SimpleTooltip>
          {/* Open in Jaeger (placeholder) */}
          <SimpleTooltip content="Jaeger integration coming soon">
            {/* Disabled, but keeps pointer-events-auto so the "coming soon"
                tooltip still shows on hover. Suppress the ghost hover bg with
                `hover:bg-transparent` (not the neutral `hover:bg-bg-hover` the
                active controls use) — a disabled control shouldn't present an
                interactive hover background. (Both light and dark hover are
                overridden — the ghost variant sets `hover:bg-accent` and a
                separate `dark:hover:bg-accent/50`.) */}
            <Button
              variant="ghost"
              size="icon-xs"
              disabled
              className="size-4 rounded text-dim hover:bg-transparent dark:hover:bg-transparent disabled:opacity-30 disabled:pointer-events-auto disabled:cursor-default"
              aria-label="Open in Jaeger"
            >
              <ExternalLink className="size-3" />
            </Button>
          </SimpleTooltip>
          {/* Next in trace */}
          {nextInTraceId != null && (
            <SimpleTooltip content="Next in trace">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setSelectedId(nextInTraceId)}
                className="size-4 rounded text-dim hover:bg-bg-hover dark:hover:bg-bg-hover hover:text-ink cursor-pointer"
                aria-label="Next exchange in trace"
              >
                <ChevronRight className="size-3" />
              </Button>
            </SimpleTooltip>
          )}
        </div>
      )}
    </div>
  );
}
