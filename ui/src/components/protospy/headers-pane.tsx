// src/components/protospy/headers-pane.tsx
// One side (request OR response) of the inspector Headers tab, in the v2.3 visual
// language: subhead title + count, a filter Input, and a header table. Carries the
// functional parity the legacy HeadersPane had — Authorization masking, substring
// search, per-row copy of the RAW value, Basic-auth decode toggle, and pinned-header
// ordering — but rebuilt on shadcn primitives (Input, Button) and semantic tokens so
// it reads as part of the same design system as the rest of the scaffold (PRO-360).
//
// Design-system §10: one Headers tab, request + response side-by-side, header counts
// in the pane subheads (not tab badges). This component is one pane; the inspector
// renders two of them in a grid.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Search, X } from "lucide-react";
import type { ProxyHeaders } from "@bindings/ProxyHeaders";
import {
  decodeBasicAuth,
  filterHeaders,
  maskHeaderValue,
  sortHeadersByPin,
} from "@ui/lib/utils";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";

export interface HeadersPaneProps {
  title: string;
  headers: ProxyHeaders;
  emptyMessage: string;
  /** Optional test hook for scoping assertions to one pane. */
  testId?: string;
}

/** Per-row copy state: which original-array index currently shows the checkmark. */
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

export function HeadersPane({
  title,
  headers,
  emptyMessage,
  testId,
}: HeadersPaneProps) {
  const [query, setQuery] = useState("");
  // Track decoded state by ORIGINAL-array index so filter/pin-sort (which reorder
  // the display) don't shift the decoded state onto the wrong row.
  const [decodedRow, setDecodedRow] = useState<number | null>(null);
  const { copiedRow, copyValue } = useCopyRow();

  // filterHeaders and sortHeadersByPin preserve object references from `headers`,
  // so indexOf() reliably recovers the original array position for stable identity.
  const displayHeaders = useMemo(
    () => sortHeadersByPin(filterHeaders(headers, query)),
    [headers, query],
  );

  return (
    <div
      data-testid={testId}
      className="flex min-h-0 flex-col overflow-hidden bg-card"
    >
      {/* Subhead — title + count (design-system §10) */}
      <div className="flex h-[30px] shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
        <span className="font-semibold text-secondary-foreground">{title}</span>
        <span className="font-mono">
          {headers.length} {headers.length === 1 ? "header" : "headers"}
        </span>
      </div>

      {headers.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <span className="text-xs text-muted-foreground">{emptyMessage}</span>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Filter input */}
          <div className="shrink-0 px-3 pt-3 pb-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter headers…"
                aria-label={`Filter ${title.toLowerCase()} headers`}
                className="h-8 pr-8 pl-8 font-mono text-xs"
              />
              {query.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setQuery("")}
                  aria-label="Clear filter"
                  className="absolute top-1/2 right-1 size-6 -translate-y-1/2 text-muted-foreground"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Table or no-match state */}
          {displayHeaders.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-4">
              <span className="text-xs text-muted-foreground">
                No matching headers
              </span>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
              <table className="w-full border-collapse font-mono text-sm">
                <tbody>
                  {displayHeaders.map((h) => {
                    const origIdx = headers.indexOf(h);
                    const displayValue = maskHeaderValue(h.name, h.value);
                    const decoded = decodeBasicAuth(h.value);
                    const isDecoded = decodedRow === origIdx;
                    return (
                      <tr
                        key={origIdx}
                        className="group border-b last:border-0"
                      >
                        <td className="w-[30%] py-1 pr-3 align-top whitespace-nowrap text-accent-foreground">
                          {h.name}
                        </td>
                        <td className="py-1 align-top text-foreground [overflow-wrap:anywhere]">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="[font-variant-ligatures:none]">
                                {displayValue}
                              </span>
                              {decoded !== null && (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() =>
                                    setDecodedRow(isDecoded ? null : origIdx)
                                  }
                                  aria-label={
                                    isDecoded
                                      ? "Hide decoded value"
                                      : "Show decoded Basic auth value"
                                  }
                                  className="ml-2 h-auto px-1 py-px text-[10px] font-normal text-muted-foreground"
                                >
                                  {isDecoded ? "hide" : "decode"}
                                </Button>
                              )}
                              {isDecoded && decoded !== null && (
                                <div className="mt-0.5 [overflow-wrap:anywhere] text-muted-foreground">
                                  {decoded}
                                </div>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => copyValue(origIdx, h.value)}
                              aria-label={`Copy ${h.name} value`}
                              className="invisible shrink-0 text-muted-foreground group-hover:visible focus-visible:visible"
                            >
                              {copiedRow === origIdx ? (
                                <Check className="size-3 text-ok" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </Button>
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
      )}
    </div>
  );
}
