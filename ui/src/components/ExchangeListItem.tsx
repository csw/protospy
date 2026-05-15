import type { Exchange } from "@ui/state/reducer";
import { formatSize, statusTextClass } from "@ui/lib/utils";
import { MethodBadge } from "./ui/MethodBadge";

interface Props {
  exchange: Exchange;
  selected: boolean;
  onSelect: () => void;
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

function pathOnly(uri: string): string {
  const q = uri.indexOf("?");
  return q === -1 ? uri : uri.slice(0, q);
}

export function ExchangeListItem({ exchange, selected, onSelect }: Props) {
  const method = exchange.method ?? "?";
  const uri = exchange.uri ?? "/";
  const isError =
    exchange.status != null && parseInt(exchange.status, 10) >= 400;

  const reqSize = exchange.requestBody?.totalBytes ?? 0;
  const resSize = exchange.responseBody?.totalBytes ?? 0;

  return (
    <button
      onClick={onSelect}
      className={[
        "w-full text-left px-2 py-1.5 border-b border-border",
        "flex flex-col gap-0.5 cursor-pointer transition-colors",
        selected ? "bg-accent text-bg" : "bg-bg-pane hover:bg-bg-hl text-ink",
        isError && !selected ? "border-l-2 border-l-red" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-selected={selected}
    >
      {/* Top row: method + status + timestamp */}
      <div className="flex items-center gap-1.5">
        <MethodBadge method={method} size="sm" />

        {exchange.status != null && (
          <span
            className={`font-family-mono text-sm font-bold ${
              selected ? "text-bg" : statusTextClass(exchange.status)
            }`}
          >
            {exchange.status}
          </span>
        )}

        <span
          className={`font-family-mono text-xs ml-auto shrink-0 ${
            selected ? "text-mid" : "text-dim"
          }`}
        >
          {formatTime(exchange.timestamp)}
        </span>
      </div>

      {/* Middle: URI path */}
      <div
        className={`font-family-mono text-sm truncate ${
          selected ? "text-bg" : "text-ink"
        }`}
        title={uri}
      >
        {pathOnly(uri)}
      </div>

      {/* Bottom: elapsed + sizes */}
      <div
        className={`flex gap-2 font-family-mono text-xs ${
          selected ? "text-mid" : "text-dim"
        }`}
      >
        {exchange.elapsedMs != null && <span>{exchange.elapsedMs}ms</span>}
        <span>
          req {formatSize(reqSize)} / res {formatSize(resSize)}
        </span>
      </div>
    </button>
  );
}
