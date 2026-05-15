import type { Exchange } from "@ui/state/reducer";
import { formatSize, formatTime, statusTextClass } from "@ui/lib/utils";

interface Props {
  exchange: Exchange;
}

interface FactRowProps {
  label: string;
  value: React.ReactNode;
}

function FactRow({ label, value }: FactRowProps) {
  return (
    <div className="flex items-baseline py-1.5 border-b border-border last:border-0">
      <span className="font-family-ui text-xs text-mid font-medium w-32 shrink-0">
        {label}
      </span>
      <span className="font-family-mono text-xs text-ink">{value}</span>
    </div>
  );
}

export function TimingView({ exchange }: Props) {
  const reqSize = exchange.requestBody?.totalBytes ?? 0;
  const resSize = exchange.responseBody?.totalBytes ?? 0;

  return (
    <div className="overflow-auto p-3">
      {/* Fact table */}
      <div>
        <FactRow
          label="Request started"
          value={formatTime(exchange.timestamp)}
        />
        <FactRow label="Method" value={exchange.method ?? "—"} />
        <FactRow label="URI" value={exchange.uri ?? "—"} />
        <FactRow label="Version" value={exchange.version ?? "—"} />
        <FactRow label="Request size" value={formatSize(reqSize)} />
        <FactRow label="Response size" value={formatSize(resSize)} />
        <FactRow
          label="Status"
          value={
            exchange.status != null ? (
              <span className={statusTextClass(exchange.status)}>
                {exchange.status}
              </span>
            ) : (
              "—"
            )
          }
        />
        <FactRow
          label="Elapsed"
          value={exchange.elapsedMs != null ? `${exchange.elapsedMs}ms` : "—"}
        />
        <FactRow label="Trace ID" value={exchange.traceId ?? "—"} />
      </div>

      {/* Waterfall */}
      <div className="mt-4 px-3">
        <div className="font-family-ui text-xs font-semibold text-ink-2 mb-2">
          Waterfall
        </div>

        {/* Upstream row */}
        <div className="flex items-center h-[14px] mb-1">
          <span className="w-20 text-xs text-mid font-family-ui shrink-0">
            Upstream
          </span>
          <div className="flex-1 bg-bg-sub rounded-sm h-[14px] overflow-hidden">
            {exchange.elapsedMs != null && (
              <div className="bg-accent h-full w-full" />
            )}
          </div>
          <span className="text-xs text-dim ml-1.5">
            {exchange.elapsedMs != null ? `${exchange.elapsedMs}ms` : "—"}
          </span>
        </div>

        {/* Proxy row */}
        <div className="flex items-center h-[14px] mb-1">
          <span className="w-20 text-xs text-mid font-family-ui shrink-0">
            Proxy
          </span>
          <div className="flex-1 bg-bg-sub rounded-sm h-[14px] overflow-hidden" />
          <span className="text-xs text-dim ml-1.5">—</span>
        </div>
      </div>
    </div>
  );
}
