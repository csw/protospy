import type { BodyState, Exchange } from "@ui/state/reducer";
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
      <span className="font-ui text-xs text-mid font-medium w-32 shrink-0">
        {label}
      </span>
      <span className="font-mono text-xs text-ink">{value}</span>
    </div>
  );
}

/**
 * Render a body size as `wire / decoded (encoding)` when the body is
 * compressed and the decode pipeline has populated `decodedBytes`, or as
 * `wire (encoding)` when it hasn't, or as plain `wire` when uncompressed.
 * Follows Chrome DevTools' slash convention for dual sizes.
 */
function bodySizeDisplay(body: BodyState | undefined): React.ReactNode {
  const wire = body?.wireBytes ?? 0;
  const encoding = body?.contentEncoding;
  const decoded = body?.decodedBytes;
  const hasDual = encoding && decoded != null && decoded !== wire;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span>
        {hasDual
          ? `${formatSize(wire)} / ${formatSize(decoded)}`
          : formatSize(wire)}
      </span>
      {encoding && <span className="text-dim">({encoding})</span>}
    </span>
  );
}

export function TimingView({ exchange }: Props) {
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
        <FactRow
          label="Request size"
          value={bodySizeDisplay(exchange.requestBody)}
        />
        <FactRow
          label="Response size"
          value={bodySizeDisplay(exchange.responseBody)}
        />
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
        <div className="font-ui text-xs font-semibold text-ink-2 mb-2">
          Waterfall
        </div>

        {/* Upstream row */}
        <div className="flex items-center h-[14px] mb-1">
          <span className="w-20 text-xs text-mid font-ui shrink-0">
            Upstream
          </span>
          <div className="flex-1 bg-bg-sub rounded-sm h-[14px] overflow-hidden">
            {exchange.elapsedMs != null && (
              <div className="bg-primary h-full w-full" />
            )}
          </div>
          <span className="text-xs text-dim ml-1.5">
            {exchange.elapsedMs != null ? `${exchange.elapsedMs}ms` : "—"}
          </span>
        </div>

        {/* Proxy row */}
        <div className="flex items-center h-[14px] mb-1">
          <span className="w-20 text-xs text-mid font-ui shrink-0">Proxy</span>
          <div className="flex-1 bg-bg-sub rounded-sm h-[14px] overflow-hidden" />
          <span className="text-xs text-dim ml-1.5">—</span>
        </div>
      </div>
    </div>
  );
}
