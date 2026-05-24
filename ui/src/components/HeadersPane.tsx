import { useEffect, useRef, useState } from "react";
import { Check, Copy, Search, X } from "lucide-react";
import type { ProxyHeaders } from "@bindings/ProxyHeaders";
import {
  decodeBasicAuth,
  filterHeaders,
  maskHeaderValue,
  sortHeadersByPin,
} from "@ui/lib/utils";
import { EmptyState } from "./ui/EmptyState";

interface HeadersPaneProps {
  headers: ProxyHeaders;
  emptyMessage: string;
}

/** Per-row copy state: which row index currently shows the "Copied" checkmark. */
function useCopyRow() {
  const [copiedRow, setCopiedRow] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  function copyValue(rowIdx: number, value: string) {
    navigator.clipboard.writeText(value).catch(() => {
      setCopiedRow(null);
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    });
    setCopiedRow(rowIdx);
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopiedRow(null), 2000);
  }

  return { copiedRow, copyValue };
}

export function HeadersPane({ headers, emptyMessage }: HeadersPaneProps) {
  const [query, setQuery] = useState("");
  // Track decoded/copied state by original-array index so that filter and
  // pin-sort operations (which change display order) don't invalidate them.
  const [decodedRow, setDecodedRow] = useState<number | null>(null);
  const { copiedRow, copyValue } = useCopyRow();

  if (headers.length === 0) {
    return <EmptyState>{emptyMessage}</EmptyState>;
  }

  // filterHeaders and sortHeadersByPin both preserve object references from
  // `headers`, so indexOf() reliably returns the original array position.
  const displayHeaders = sortHeadersByPin(filterHeaders(headers, query));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search bar */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center gap-1.5 rounded-[4px] bg-bg-sub border border-border px-2.5 h-[24px] min-w-0">
          <Search size={11} className="text-dim shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter headers…"
            className="flex-1 bg-transparent border-none outline-none font-family-mono text-xs text-ink placeholder:text-dim min-w-0"
          />
          {query.length > 0 && (
            <button
              onClick={() => setQuery("")}
              className="text-dim hover:text-ink transition-colors shrink-0 cursor-pointer"
              aria-label="Clear filter"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Table or no-match state */}
      {displayHeaders.length === 0 ? (
        <EmptyState>No matching headers</EmptyState>
      ) : (
        <div className="overflow-auto flex-1 px-3 pb-3">
          <table className="w-full text-xs font-family-mono">
            <tbody>
              {displayHeaders.map((h) => {
                // Use the original-array index as a stable identity for this
                // header: keys, decoded state, and copy state all track it so
                // filter / pin-sort changes don't shift state to the wrong row.
                const origIdx = headers.indexOf(h);
                const displayValue = maskHeaderValue(h.name, h.value);
                const decoded = decodeBasicAuth(h.value);
                const isDecoded = decodedRow === origIdx;

                return (
                  <tr
                    key={origIdx}
                    className="group border-b border-border last:border-0 hover:bg-bg-hl"
                  >
                    {/* Name cell */}
                    <td
                      className="py-1 pr-4 text-accent-ink whitespace-nowrap align-top"
                      style={{ width: "30%" }}
                    >
                      {h.name}
                    </td>

                    {/* Value cell */}
                    <td className="py-1 text-ink break-all">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <span>{displayValue}</span>
                          {/* Basic auth decode toggle */}
                          {decoded !== null && (
                            <button
                              onClick={() =>
                                setDecodedRow(isDecoded ? null : origIdx)
                              }
                              className="ml-2 text-[10px] text-dim hover:text-ink transition-colors cursor-pointer border border-border rounded px-1 py-px"
                              aria-label={
                                isDecoded
                                  ? "Hide decoded value"
                                  : "Show decoded Basic auth value"
                              }
                            >
                              {isDecoded ? "hide" : "decode"}
                            </button>
                          )}
                          {/* Decoded credential */}
                          {isDecoded && decoded !== null && (
                            <div className="mt-0.5 text-dim break-all">
                              {decoded}
                            </div>
                          )}
                        </div>

                        {/* Copy button — appears on row hover */}
                        <button
                          onClick={() => copyValue(origIdx, h.value)}
                          className="invisible group-hover:visible shrink-0 text-dim hover:text-ink transition-colors cursor-pointer mt-0.5"
                          aria-label={`Copy ${h.name} value`}
                        >
                          {copiedRow === origIdx ? (
                            <Check size={11} className="text-green" />
                          ) : (
                            <Copy size={11} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
