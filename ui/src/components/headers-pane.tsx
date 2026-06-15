// src/components/protospy/headers-pane.tsx
// One side (request OR response) of the inspector Headers tab, in the v2.3 visual
// language: subhead title + count, a filter Input, and a header table. Carries the
// functional parity the legacy HeadersPane had — Authorization credentials shown
// masked → revealed (raw) → decoded (Basic only): an eye toggle for hide/show (the
// conventional password-field pattern) plus a decode toggle once revealed —
// substring search, per-row copy of whatever value is displayed, and pinned-header
// ordering — but rebuilt on shadcn primitives (Input, Button) and semantic tokens
// so it reads as part of the same design system as the rest of the scaffold (PRO-360).
//
// Design-system §10: one Headers tab, request + response side-by-side, header counts
// in the pane subheads (not tab badges). This component is one pane; the inspector
// renders two of them in a grid.

import { useEffect, useMemo, useRef, useState } from "react";
import { Braces, Check, Copy, Eye, EyeOff, Search, X } from "lucide-react";
import type { ProxyHeaders } from "@bindings/ProxyHeaders";
import {
  decodeBasicAuth,
  filterHeaders,
  maskHeaderValue,
  sortHeadersByPin,
} from "@ui/lib/utils";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Toggle } from "@ui/components/ui/toggle";

/** The representation an Authorization value is currently shown in. */
type HeaderView = "raw" | "decoded";

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

  function clearCopiedRow(rowIdx: number) {
    setCopiedRow((current) => {
      if (current !== rowIdx) return current;
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return null;
    });
  }

  return { copiedRow, copyValue, clearCopiedRow };
}

export function HeadersPane({
  title,
  headers,
  emptyMessage,
  testId,
}: HeadersPaneProps) {
  const [query, setQuery] = useState("");
  // Which row is unmasked, and in what representation. Tracked by ORIGINAL-array
  // index so filter/pin-sort (which reorder the display) don't shift the state
  // onto the wrong row. Only one row is unmasked at a time — revealing another
  // re-masks the previous, so a secret is never left exposed in two places.
  const [reveal, setReveal] = useState<{
    row: number;
    view: HeaderView;
  } | null>(null);
  const { copiedRow, copyValue, clearCopiedRow } = useCopyRow();

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
      <div className="flex h-strip shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
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
                    const masked = maskHeaderValue(h.name, h.value);
                    // The reveal/decode controls only apply where masking
                    // actually hid something (i.e. Authorization).
                    const isMaskable = masked !== h.value;
                    const decoded = isMaskable
                      ? decodeBasicAuth(h.value)
                      : null;
                    const view = reveal?.row === origIdx ? reveal.view : null;
                    const isDecoded = view === "decoded" && decoded !== null;
                    // masked (view null) → masked text; raw → wire value;
                    // decoded → human-readable credential.
                    const shown = !isMaskable
                      ? h.value
                      : isDecoded
                        ? decoded
                        : view === "raw"
                          ? h.value
                          : masked;
                    // Copy follows the display: decoded credential when decoded,
                    // otherwise the raw (base64) wire value.
                    const copyTarget = isDecoded ? decoded : h.value;
                    return (
                      <tr
                        key={origIdx}
                        className="group border-b last:border-0"
                        onMouseLeave={() => clearCopiedRow(origIdx)}
                      >
                        <td className="w-[30%] py-0.5 pr-3 align-middle whitespace-nowrap text-secondary-foreground">
                          {h.name}
                        </td>
                        <td className="py-0.5 align-middle text-foreground wrap-anywhere">
                          <div className="flex items-center gap-1">
                            <span className="min-w-0 flex-1 [font-variant-ligatures:none]">
                              {shown}
                            </span>
                            {isMaskable && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() =>
                                  setReveal(
                                    view === null
                                      ? { row: origIdx, view: "raw" }
                                      : null,
                                  )
                                }
                                aria-label={
                                  view === null ? "Reveal value" : "Hide value"
                                }
                                className="shrink-0 text-muted-foreground"
                              >
                                {view === null ? (
                                  <Eye className="size-3" />
                                ) : (
                                  <EyeOff className="size-3" />
                                )}
                              </Button>
                            )}
                            {isMaskable &&
                              decoded !== null &&
                              view !== null && (
                                <Toggle
                                  size="icon-xs"
                                  pressed={isDecoded}
                                  onPressedChange={(on) =>
                                    setReveal({
                                      row: origIdx,
                                      view: on ? "decoded" : "raw",
                                    })
                                  }
                                  aria-label={
                                    isDecoded
                                      ? "Show raw value"
                                      : "Decode value"
                                  }
                                  className="shrink-0 text-muted-foreground aria-pressed:bg-transparent aria-pressed:text-muted-foreground"
                                >
                                  <Braces />
                                </Toggle>
                              )}
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => copyValue(origIdx, copyTarget)}
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
