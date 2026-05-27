import type { Exchange } from "@ui/state/reducer";
import {
  formatSize,
  splitUri,
  statusTextClass,
  traceColor,
} from "@ui/lib/utils";
import { useRelativeTime } from "@ui/hooks/useRelativeTime";
import { CompressionIndicator } from "./CompressionIndicator";
import { MethodBadge } from "./ui/MethodBadge";

interface Props {
  exchange: Exchange;
  selected: boolean;
  onSelect: () => void;
  density: "regular" | "compact";
}

export function ExchangeListItem({
  exchange,
  selected,
  onSelect,
  density,
}: Props) {
  const relTime = useRelativeTime(exchange.timestamp);
  const method = exchange.method ?? "?";
  const uri = exchange.uri ?? "/";
  const { path, query } = splitUri(uri);

  const reqSize = exchange.requestBody?.wireBytes ?? 0;
  const resSize = exchange.responseBody?.wireBytes ?? 0;

  const hasError = exchange.error != null && exchange.status == null;

  // Trace color bar: always reserve 4px border-l, color it when traceId is present
  const traceBarStyle: React.CSSProperties = exchange.traceId
    ? { borderLeftColor: traceColor(exchange.traceId) }
    : {};

  const paddingY = density === "compact" ? "py-1.5" : "py-2";
  const paddingX = density === "compact" ? "px-[10px]" : "px-3";
  const rowGap = density === "compact" ? "gap-0" : "gap-0.5";

  return (
    <button
      onClick={onSelect}
      className={[
        "w-full text-left border-b border-border",
        "flex flex-col cursor-pointer transition-colors",
        "border-l-4",
        "overflow-hidden",
        paddingY,
        paddingX,
        rowGap,
        selected
          ? "bg-bg-active border-l-accent"
          : "bg-bg-pane hover:bg-bg-hover",
      ]
        .filter(Boolean)
        .join(" ")}
      style={selected ? undefined : traceBarStyle}
      role="option"
      aria-selected={selected}
    >
      {/* When selected, overlay 2px accent inset bar via box-shadow or inline —
          the border-l-accent class handles it as the full 4px bar in accent color */}

      {/* Row 1: method + status + timestamp */}
      <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
        <MethodBadge method={method} size="sm" />

        {exchange.status != null ? (
          <span
            data-testid="status-code"
            className={`font-family-mono text-ui-sm font-semibold shrink-0 ${statusTextClass(exchange.status)}`}
          >
            {exchange.status}
          </span>
        ) : hasError ? (
          <span className="font-family-mono text-ui-sm font-semibold shrink-0 text-red">
            ERR
          </span>
        ) : null}

        <span className="font-family-mono text-xs ml-auto shrink-0 text-dim">
          {relTime}
        </span>
      </div>

      {/* Row 2: URI path + query */}
      <div
        className="flex min-w-0 overflow-hidden font-family-mono text-sm"
        title={uri}
      >
        <span className="text-ink-2 truncate">{path}</span>
        {query && (
          <span className="text-dim truncate shrink-0 max-w-[40%]">
            {query}
          </span>
        )}
      </div>

      {/* Row 3: elapsed + sizes.
          whitespace-nowrap prevents spans from wrapping at narrow widths (which would
          inflate the button height and cause row overlap). Content hard-clips at the
          pane edge with no ellipsis — acceptable for supplementary size metadata. */}
      <div className="flex gap-1.5 min-w-0 overflow-hidden whitespace-nowrap font-family-mono text-xs text-mid">
        {exchange.elapsedMs != null && (
          <>
            <span>{exchange.elapsedMs}ms</span>
            <span className="text-dim">·</span>
          </>
        )}
        <span className="inline-flex items-center gap-1">
          req {formatSize(reqSize)}
          <CompressionIndicator
            encoding={exchange.requestBody?.contentEncoding}
          />
        </span>
        <span className="text-dim">·</span>
        <span className="inline-flex items-center gap-1">
          res {formatSize(resSize)}
          <CompressionIndicator
            encoding={exchange.responseBody?.contentEncoding}
          />
        </span>
      </div>
    </button>
  );
}
