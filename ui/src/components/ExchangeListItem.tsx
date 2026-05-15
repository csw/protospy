import type { Exchange } from "@ui/state/reducer";
import {
  formatSize,
  formatTime,
  statusTextClass,
  traceColor,
} from "@ui/lib/utils";
import { MethodBadge } from "./ui/MethodBadge";

interface Props {
  exchange: Exchange;
  selected: boolean;
  onSelect: () => void;
  density: "regular" | "compact";
}

function splitUri(uri: string): { path: string; query: string } {
  const q = uri.indexOf("?");
  if (q === -1) return { path: uri, query: "" };
  return { path: uri.slice(0, q), query: uri.slice(q) };
}

export function ExchangeListItem({
  exchange,
  selected,
  onSelect,
  density,
}: Props) {
  const method = exchange.method ?? "?";
  const uri = exchange.uri ?? "/";
  const { path, query } = splitUri(uri);

  const reqSize = exchange.requestBody?.totalBytes ?? 0;
  const resSize = exchange.responseBody?.totalBytes ?? 0;

  const hasError = exchange.error != null && exchange.status == null;

  // Trace color bar: always reserve 4px border-l, color it when traceId is present
  const traceBarStyle: React.CSSProperties = exchange.traceId
    ? { borderLeftColor: traceColor(exchange.traceId) }
    : {};

  const paddingY = density === "compact" ? "py-1" : "py-1.5";
  const rowGap = density === "compact" ? "gap-0" : "gap-0.5";

  return (
    <button
      onClick={onSelect}
      className={[
        "w-full text-left px-2 border-b border-border",
        "flex flex-col cursor-pointer transition-colors",
        "border-l-4",
        paddingY,
        rowGap,
        selected
          ? "bg-bg-active border-l-accent"
          : "bg-bg-pane hover:bg-bg-hover",
      ]
        .filter(Boolean)
        .join(" ")}
      style={selected ? undefined : traceBarStyle}
      aria-selected={selected}
    >
      {/* When selected, overlay 2px accent inset bar via box-shadow or inline —
          the border-l-accent class handles it as the full 4px bar in accent color */}

      {/* Row 1: method + status + timestamp */}
      <div className="flex items-center gap-1.5 min-w-0">
        <MethodBadge method={method} size="sm" />

        {exchange.status != null ? (
          <span
            className={`font-family-mono text-sm font-bold ${statusTextClass(exchange.status)}`}
          >
            {exchange.status}
          </span>
        ) : hasError ? (
          <span className="font-family-mono text-sm font-bold text-red">
            ERR
          </span>
        ) : null}

        <span className="font-family-mono text-xs ml-auto shrink-0 text-dim">
          {formatTime(exchange.timestamp)}
        </span>
      </div>

      {/* Row 2: URI path + query */}
      <div className="flex min-w-0 font-family-mono text-sm" title={uri}>
        <span className="text-ink truncate">{path}</span>
        {query && (
          <span className="text-dim truncate shrink-0 max-w-[40%]">
            {query}
          </span>
        )}
      </div>

      {/* Row 3: elapsed + sizes */}
      <div className="flex gap-1.5 font-family-mono text-xs text-mid">
        {exchange.elapsedMs != null && (
          <>
            <span>{exchange.elapsedMs}ms</span>
            <span className="text-dim">·</span>
          </>
        )}
        <span>req {formatSize(reqSize)}</span>
        <span className="text-dim">·</span>
        <span>res {formatSize(resSize)}</span>
      </div>
    </button>
  );
}
