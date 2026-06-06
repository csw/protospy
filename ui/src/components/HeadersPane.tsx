import { useState } from "react";
import type { ProxyHeaders } from "@bindings/ProxyHeaders";
import {
  decodeBasicAuth,
  filterHeaders,
  maskHeaderValue,
  sortHeadersByPin,
} from "@ui/lib/utils";
import { CopyButton } from "./CopyButton";
import { EmptyState } from "./ui/EmptyState";
import { SearchInput } from "./ui/SearchInput";
import { Toggle } from "./ui/toggle";

interface HeadersPaneProps {
  headers: ProxyHeaders;
  emptyMessage: string;
}

export function HeadersPane({ headers, emptyMessage }: HeadersPaneProps) {
  const [query, setQuery] = useState("");
  // Track decoded state by original-array index so that filter and pin-sort
  // operations (which change display order) don't invalidate it.
  const [decodedRow, setDecodedRow] = useState<number | null>(null);

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
        <SearchInput
          data-testid="headers-search-wrapper"
          value={query}
          onChange={setQuery}
          placeholder="Filter headers…"
        />
      </div>

      {/* Table or no-match state */}
      {displayHeaders.length === 0 ? (
        <EmptyState>No matching headers</EmptyState>
      ) : (
        <div className="overflow-auto flex-1 px-3 pb-3">
          <table className="w-full text-xs font-mono">
            <tbody>
              {displayHeaders.map((h) => {
                // Use the original-array index as a stable identity for this
                // header: keys and decoded state track it so filter / pin-sort
                // changes don't shift state to the wrong row.
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
                          <span className="[font-variant-ligatures:none]">
                            {displayValue}
                          </span>
                          {/* Basic auth decode toggle (persistent on/off) */}
                          {decoded !== null && (
                            <Toggle
                              pressed={isDecoded}
                              onPressedChange={(p) =>
                                setDecodedRow(p ? origIdx : null)
                              }
                              aria-label={
                                isDecoded
                                  ? "Hide decoded value"
                                  : "Show decoded Basic auth value"
                              }
                              className="ml-2 h-auto min-w-0 rounded border border-border px-1 py-px text-[10px] align-baseline"
                            >
                              {isDecoded ? "hide" : "decode"}
                            </Toggle>
                          )}
                          {/* Decoded credential */}
                          {isDecoded && decoded !== null && (
                            <div className="mt-0.5 text-dim break-all">
                              {decoded}
                            </div>
                          )}
                        </div>

                        {/* Copy button — appears on row hover */}
                        <CopyButton
                          mode="icon"
                          text={h.value}
                          aria-label={`Copy ${h.name} value`}
                          className="invisible group-hover:visible mt-0.5 shrink-0"
                        />
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
