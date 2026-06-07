import { useState } from "react";
import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/reducer";
import { matchesFilter } from "@ui/lib/utils";
import { showPairsTab } from "@ui/protocol";
import { EmptyState } from "./ui/EmptyState";
import { ContextBar } from "./ContextBar";
import { BodySplit } from "./BodySplit";
import { HeadersSplit } from "./HeadersSplit";
import { TimingView } from "./TimingView";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

const tabTriggerClass =
  "h-full rounded-none px-3 text-xs text-mid hover:text-ink data-[state=active]:text-ink data-[state=active]:font-medium data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent";

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
        <EmptyState textSize="sm">Select a request to inspect it</EmptyState>
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
          data-testid="inspector-tab-list"
          variant="line"
          className="h-8 p-0 w-full justify-start rounded-none border-b border-border bg-bg-pane px-2 gap-0"
        >
          <TabsTrigger value="bodies" className={tabTriggerClass}>
            {isStream ? "Stream" : "Bodies"}
          </TabsTrigger>
          {isMsearch && (
            <TabsTrigger value="pairs" className={tabTriggerClass}>
              Pairs
            </TabsTrigger>
          )}
          <TabsTrigger value="headers" className={tabTriggerClass}>
            Headers
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
            <EmptyState>Paired request view is not yet available</EmptyState>
          </TabsContent>
        )}

        {/* Headers tab — request and response side-by-side */}
        <TabsContent
          value="headers"
          className="flex flex-col flex-1 min-h-0 overflow-hidden mt-0"
        >
          <HeadersSplit
            key={exchange.id}
            reqHeaders={reqHeaders}
            resHeaders={resHeaders}
          />
        </TabsContent>

        {/* Timing tab */}
        <TabsContent value="timing" className="flex-1 overflow-auto mt-0">
          <TimingView exchange={exchange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
