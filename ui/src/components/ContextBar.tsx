import type { Exchange } from "@ui/state/reducer";
import { statusChipClass } from "@ui/lib/utils";
import { MethodBadge } from "./ui/MethodBadge";

interface Props {
  exchange: Exchange;
}

export function ContextBar({ exchange }: Props) {
  const method = exchange.method ?? "?";
  const uri = exchange.uri ?? "/";

  // Path without query
  const pathOnly = uri.includes("?") ? uri.slice(0, uri.indexOf("?")) : uri;

  return (
    <div className="flex items-center gap-2 px-3 h-9 bg-ink border-b-2 border-red shrink-0 overflow-hidden">
      {/* Method badge */}
      <MethodBadge method={method} size="md" />

      {/* URI path */}
      <span className="font-family-mono text-xs text-bg flex-1 truncate">
        {pathOnly}
      </span>

      {/* Status chip */}
      {exchange.status != null && (
        <span
          className={`font-family-mono text-sm border px-2 py-0.5 shrink-0 ${statusChipClass(exchange.status)}`}
        >
          {exchange.status}
        </span>
      )}

      {/* Elapsed time */}
      {exchange.elapsedMs != null && (
        <span className="font-family-mono text-sm text-dim border border-border px-2 py-0.5 shrink-0">
          {exchange.elapsedMs}ms
        </span>
      )}
    </div>
  );
}
