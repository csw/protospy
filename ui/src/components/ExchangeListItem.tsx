import type { BodyState, Exchange } from "@ui/state/reducer";
import {
  formatSize,
  shortEncoding,
  splitUri,
  statusTextClass,
  traceColor,
} from "@ui/lib/utils";
import { useRelativeTime } from "@ui/hooks/useRelativeTime";
import { MethodBadge } from "./ui/MethodBadge";

/**
 * Inline size for the metadata row: shows `wire/decoded` when the body
 * is compressed and the decode pipeline has populated `decodedBytes`,
 * otherwise just `wire`. A short encoding tag (e.g. `gz`) appears after
 * the size when the body has a `Content-Encoding`. Chrome DevTools'
 * slash convention; space-constrained variant of the `TimingView`
 * format (no parens around the encoding).
 */
function inlineSize(body: BodyState | undefined): {
  text: string;
  tag: string | null;
  title: string | undefined;
} {
  const wire = body?.wireBytes ?? 0;
  const encoding = body?.contentEncoding;
  const decoded = body?.decodedBytes;
  const tag = shortEncoding(encoding);
  if (tag != null && decoded != null && decoded !== wire) {
    return {
      text: `${formatSize(wire)}/${formatSize(decoded)}`,
      tag,
      title: `${formatSize(wire)} on the wire / ${formatSize(decoded)} after decompression (${encoding})`,
    };
  }
  if (tag != null) {
    return {
      text: formatSize(wire),
      tag,
      title: `${formatSize(wire)} on the wire (${encoding}; decoded size unknown until body is opened)`,
    };
  }
  return { text: formatSize(wire), tag: null, title: undefined };
}

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

  const req = inlineSize(exchange.requestBody);
  const res = inlineSize(exchange.responseBody);

  const hasError = exchange.error != null;
  const hasErrorWithoutStatus = hasError && exchange.status == null;

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
        ) : hasErrorWithoutStatus ? (
          <span className="font-family-mono text-ui-sm font-semibold shrink-0 text-red">
            Error
          </span>
        ) : null}
        {hasError && exchange.status != null && (
          <span
            data-testid="error-indicator"
            className="font-family-mono text-ui-xs font-semibold shrink-0 text-red"
            title={exchange.error?.message}
          >
            · interrupted
          </span>
        )}

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
        <span title={req.title}>
          req {req.text}
          {req.tag && <span className="text-dim"> ({req.tag})</span>}
        </span>
        <span className="text-dim">·</span>
        <span title={res.title}>
          res {res.text}
          {res.tag && <span className="text-dim"> ({res.tag})</span>}
        </span>
      </div>
    </button>
  );
}
