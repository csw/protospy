// src/components/InspectorPane.tsx — the live container for the v2.3 scaffold
// inspector (PRO-360 Slice 2). Owns the store subscription, the filtered/ordered
// visible-exchange derivation, selected-exchange resolution, keyboard/button
// navigation (prev / next / next-matching / next-in-trace), and protocol-tab
// gating — then feeds the presentational scaffold `Inspector` shell its slots.
//
// Mirrors ExchangeList's container pattern (PRO-359): the store wiring + ordered
// derivation live here; the scaffold component stays presentational.

import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/reducer";
import { matchesFilter, splitUri } from "@ui/lib/utils";
import { showPairsTab } from "@ui/protocol";
import { Inspector, type MsearchView } from "./protospy/inspector";
import { BodySplit } from "./BodySplit";
import { EmptyState } from "./ui/EmptyState";

export function InspectorPane() {
  const exchanges = useStore((s) => s.exchanges);
  const ids = useStore((s) => s.ids);
  const selectedId = useStore((s) => s.selectedId);
  const setSelectedId = useStore((s) => s.setSelectedId);
  const filter = useStore((s) => s.filter);
  const traceFilter = useStore((s) => s.traceFilter);
  const setTraceFilter = useStore((s) => s.setTraceFilter);
  const order = useStore((s) => s.order);
  const protocol = useStore((s) => s.protocol);
  const timeZone = useStore((s) => s.timeZone);

  // Selected exchange.
  const exchange: Exchange | null =
    selectedId != null ? (exchanges.get(selectedId) ?? null) : null;

  // Filtered + ordered visible list (mirrors ExchangeList).
  const filtered = ids
    .map((id) => exchanges.get(id))
    .filter((ex): ex is Exchange => ex != null)
    .filter((ex) => matchesFilter(ex, filter))
    .filter((ex) => traceFilter == null || ex.traceId === traceFilter);
  const ordered = order === "newest" ? [...filtered].reverse() : filtered;

  if (exchange == null) {
    return (
      <div className="h-full overflow-hidden bg-background">
        <EmptyState textSize="sm">Select a request to inspect it</EmptyState>
      </div>
    );
  }

  const currentIdx = ordered.findIndex((ex) => ex.id === exchange.id);
  const prev = currentIdx > 0 ? ordered[currentIdx - 1] : null;
  const next =
    currentIdx >= 0 && currentIdx < ordered.length - 1
      ? ordered[currentIdx + 1]
      : null;

  // Next exchange with the same method + path (ignoring the query string).
  function nextMatching(): Exchange | null {
    if (currentIdx < 0 || exchange == null) return null;
    const path = exchange.uri != null ? splitUri(exchange.uri).path : null;
    for (let i = currentIdx + 1; i < ordered.length; i++) {
      const ex = ordered[i];
      if (
        ex.method === exchange.method &&
        ex.uri != null &&
        splitUri(ex.uri).path === path
      ) {
        return ex;
      }
    }
    return null;
  }

  // Next exchange sharing the selected trace id.
  function nextInTrace(traceId: string): Exchange | null {
    if (currentIdx < 0) return null;
    for (let i = currentIdx + 1; i < ordered.length; i++) {
      if (ordered[i].traceId === traceId) return ordered[i];
    }
    return null;
  }

  const matching = nextMatching();
  const isMsearch = showPairsTab(protocol, exchange.uri);

  return (
    <Inspector
      exchange={exchange}
      tz={timeZone}
      isMsearch={isMsearch}
      onPrev={prev != null ? () => setSelectedId(prev.id) : undefined}
      onNext={next != null ? () => setSelectedId(next.id) : undefined}
      onNextMatching={
        matching != null ? () => setSelectedId(matching.id) : undefined
      }
      onFilterTrace={(id) => setTraceFilter(id)}
      onCopyTrace={(id) => void navigator.clipboard.writeText(id)}
      onNextInTrace={(id) => {
        const target = nextInTrace(id);
        if (target != null) setSelectedId(target.id);
      }}
      renderBodySplit={() => (
        <BodySplit exchange={exchange} protocol={protocol} />
      )}
      renderMsearch={(view: MsearchView) =>
        view === "raw" ? (
          <BodySplit exchange={exchange} protocol={protocol} />
        ) : (
          <EmptyState textSize="sm">
            Paired request view is not yet available
          </EmptyState>
        )
      }
    />
  );
}
