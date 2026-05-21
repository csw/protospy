import { useState } from "react";
import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/reducer";
import { matchesFilter } from "@ui/lib/utils";
import { showPairsTab } from "@ui/protocol";
import { EmptyState } from "./ui/EmptyState";
import { ContextBar } from "./ContextBar";
import { BodySplit } from "./BodySplit";
import { TimingView } from "./TimingView";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import type { ProxyHeaders } from "@bindings/ProxyHeaders";

const tabTriggerClass =
  "h-full rounded-none px-3 text-xs text-mid hover:text-ink data-[state=active]:text-ink data-[state=active]:font-medium data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:bg-transparent";

function HeaderTable({ headers }: { headers: ProxyHeaders }) {
  return (
    <div className="overflow-auto p-3">
      <table className="w-full text-xs font-family-mono">
        <tbody>
          {headers.map((h, i) => (
            <tr
              key={i}
              className="border-b border-border last:border-0 hover:bg-bg-hl"
            >
              <td
                className="py-1 pr-4 text-accent-ink whitespace-nowrap align-top"
                style={{ width: "30%" }}
              >
                {h.name}
              </td>
              <td className="py-1 text-ink break-all">{h.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Inspector() {
  const exchanges = useStore((s) => s.exchanges);
  const ids = useStore((s) => s.ids);
  const selectedId = useStore((s) => s.selectedId);
  const filter = useStore((s) => s.filter);
  const traceFilter = useStore((s) => s.traceFilter);
  const order = useStore((s) => s.order);
  const protocol = useStore((s) => s.protocol);

  const [activeTab, setActiveTab] = useState("bodies");

  // Derive the selected exchange
  const exchange: Exchange | null =
    selectedId != null ? (exchanges.get(selectedId) ?? null) : null;

  // Derive filtered + ordered list (mirrors ExchangeList logic)
  const filtered = ids
    .map((id) => exchanges.get(id))
    .filter((ex): ex is Exchange => ex != null)
    .filter((ex) => matchesFilter(ex, filter))
    .filter((ex) => traceFilter == null || ex.traceId === traceFilter);
  const ordered = order === "newest" ? [...filtered].reverse() : filtered;

  const currentIdx =
    exchange != null ? ordered.findIndex((ex) => ex.id === exchange.id) : -1;

  const isMsearch = showPairsTab(protocol, exchange?.uri);

  // Derive effective tab: fall back to "bodies" if "pairs" is active but not applicable
  const effectiveTab =
    activeTab === "pairs" && !isMsearch ? "bodies" : activeTab;

  if (exchange == null) {
    return (
      <div className="h-full bg-bg-pane overflow-hidden">
        <EmptyState textSize="sm">Select an exchange</EmptyState>
      </div>
    );
  }

  const isStream = exchange.responseBody?.contentType
    ?.toLowerCase()
    ?.startsWith("text/event-stream");

  const reqHeaders = exchange.requestHeaders ?? [];
  const resHeaders = exchange.responseHeaders ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bg-pane">
      {/* Context bar */}
      <ContextBar
        exchange={exchange}
        ordered={ordered}
        currentIdx={currentIdx}
      />

      {/* Tabs */}
      <Tabs
        value={effectiveTab}
        onValueChange={setActiveTab}
        className="flex flex-col flex-1 min-h-0 overflow-hidden gap-0"
      >
        {/* Tab strip (32px) */}
        <TabsList
          variant="line"
          className="h-8 w-full justify-start rounded-none border-b border-border bg-bg-sub px-2 gap-0"
        >
          <TabsTrigger value="bodies" className={tabTriggerClass}>
            {isStream ? "Stream" : "Bodies"}
          </TabsTrigger>
          {isMsearch && (
            <TabsTrigger value="pairs" className={tabTriggerClass}>
              Pairs
            </TabsTrigger>
          )}
          <TabsTrigger value="req-headers" className={tabTriggerClass}>
            Req headers ({reqHeaders.length})
          </TabsTrigger>
          <TabsTrigger value="res-headers" className={tabTriggerClass}>
            Res headers ({resHeaders.length})
          </TabsTrigger>
          <TabsTrigger value="timing" className={tabTriggerClass}>
            Timing
          </TabsTrigger>
        </TabsList>

        {/* Bodies tab */}
        <TabsContent
          value="bodies"
          className="flex flex-col flex-1 min-h-0 overflow-hidden mt-0"
        >
          <BodySplit exchange={exchange} protocol={protocol} />
        </TabsContent>

        {/* Pairs tab (msearch/mget only) */}
        {isMsearch && (
          <TabsContent value="pairs" className="flex-1 overflow-auto mt-0">
            <EmptyState>Paired view coming soon</EmptyState>
          </TabsContent>
        )}

        {/* Req headers tab */}
        <TabsContent value="req-headers" className="flex-1 overflow-auto mt-0">
          {reqHeaders.length > 0 ? (
            <HeaderTable headers={reqHeaders} />
          ) : (
            <EmptyState>No request headers</EmptyState>
          )}
        </TabsContent>

        {/* Res headers tab */}
        <TabsContent value="res-headers" className="flex-1 overflow-auto mt-0">
          {resHeaders.length > 0 ? (
            <HeaderTable headers={resHeaders} />
          ) : (
            <EmptyState>No response headers</EmptyState>
          )}
        </TabsContent>

        {/* Timing tab */}
        <TabsContent value="timing" className="flex-1 overflow-auto mt-0">
          <TimingView exchange={exchange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
