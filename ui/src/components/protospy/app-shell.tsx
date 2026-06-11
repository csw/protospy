// src/components/protospy/app-shell.tsx
// The page composition. This is the ONE place that bridges the store to the
// content components: the chrome (top/filter/status/list-toolbar/palette) reads
// & writes the store itself, while the prop-driven content pieces (ExchangeTable,
// ExchangeRow, Inspector) are fed derived slices here. Heavy body renderers
// (JsonViewer, stream, msearch) stay app-owned and arrive as render slots —
// the shell never imports a body viewer.
//
// Owns: the resizable list↔inspector split (width persists per list-mode) and
// the global keyboard map (j/k/↑/↓ select, ⌘K palette, / filter, ? help).
//
// v2.4 shell wire-up (PRO-357): App.tsx mounts this shell as the live outer
// layer. It keeps the app-owned reducer/SSE/body plumbing but adopts the
// scaffold chrome, keyboard map, and percentage-based panel behavior.

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePanelRef } from "react-resizable-panels";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useShallow } from "zustand/react/shallow";
import type { Protocol } from "@bindings/Protocol";
import type { Service } from "@bindings/Service";
import { fetchInfo } from "@ui/api/info";
import type { Info } from "@ui/api/info";
import { subscribeToEvents } from "@ui/api/sse";
import type { ConnectionStatus as ApiConnectionStatus } from "@ui/api/sse";
import { notifyConnection } from "@ui/lib/toast";
import { useDensity } from "@ui/lib/density";
import { observeElementRectWithFallback } from "@ui/lib/virtual";
import type { TimeZone } from "@ui/lib/utils";
import { connDotStatus } from "./connection-dot";
import { useStore, selectVisibleIds, selectSelected } from "@ui/state/store";
import type { Exchange } from "@ui/state/reducer";
import { showPairsTab } from "@ui/protocol";
import { TopBar, type ServiceInfo } from "./top-bar";
import { FilterBar } from "./filter-bar";
import { ListToolbar } from "./list-toolbar";
import { StatusBar } from "./status-bar";
import { CommandPalette } from "./command-palette";
import { ShortcutsOverlay } from "./shortcuts-overlay";
import { ExchangeTable } from "./exchange-table";
import { ExchangeRow } from "./exchange-row";
import { GroupedExchangeList } from "./trace-group";
import { EmptyState } from "./empty-state";
import { Inspector, type MsearchView } from "./inspector";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@ui/components/ui/resizable";

export interface AppShellProps {
  /** Configured services for the picker (app/config-owned). */
  services?: ServiceInfo[];
  /** Upstream URL for the status bar (config-owned). */
  upstream?: string;

  // ── inspector heavy-content slots (app-owned; see inspector.tsx) ──
  // The live `Inspector` exposes two slots — the split body view and the
  // (optional) paired msearch view; the JsonViewer/stream viewers live inside
  // `BodySplit`, so the shell never threads a `renderBody`/`renderStream` slot.
  renderBodySplit: (x: Exchange, protocol: Protocol | null) => ReactNode;
  renderMsearch?: (
    x: Exchange,
    protocol: Protocol | null,
    view: MsearchView,
  ) => ReactNode;
}

export function AppShell(props: AppShellProps) {
  // Density is store-backed (a `subscribeWithSelector` subscription writes
  // `<html data-density>`); `useDensity()` reads it. No DensityProvider needed.
  return <ShellInner {...props} />;
}

function ShellInner({
  services: fallbackServices,
  upstream: fallbackUpstream,
  renderBodySplit,
  renderMsearch,
}: AppShellProps) {
  const filterRef = useRef<HTMLInputElement>(null);
  const listPanelRef = usePanelRef();
  const prevConnection = useRef<ApiConnectionStatus | null>(null);
  const appliedInitialPanelSize = useRef<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);

  const applyEvent = useStore((s) => s.applyEvent);
  const setConnection = useStore((s) => s.setConnection);
  const setService = useStore((s) => s.setService);
  const setProtocol = useStore((s) => s.setProtocol);
  const service = useStore((s) => s.service);
  const connection = useStore((s) => s.connection);
  const listMode = useStore((s) => s.listMode);
  const setListWidth = useStore((s) => s.setListWidth);
  const listWidth = useStore((s) => s.listWidth);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const currentListWidth = listWidth[listMode];

  useGlobalKeys(filterRef);

  useLayoutEffect(() => {
    let cancelled = false;

    fetchInfo()
      .then((fetchedInfo) => {
        if (cancelled) return;
        setInfo(fetchedInfo);
        const svc = fetchedInfo.services[0];
        if (svc == null) return;
        if (useStore.getState().service != null) return;
        setService(svc.name);
        setProtocol(svc.protocol);
      })
      .catch(() => {
        // /info failed; stay in connecting until refresh or backend recovery.
      });

    return () => {
      cancelled = true;
    };
  }, [setService, setProtocol]);

  useEffect(() => {
    if (service == null) return;

    const svc = info?.services.find((candidate) => candidate.name === service);
    setProtocol(svc?.protocol ?? null);
  }, [info, service, setProtocol]);

  useEffect(() => {
    if (service == null) return;

    const cleanup = subscribeToEvents(
      service,
      (msg) => applyEvent(msg),
      (status) => {
        notifyConnection(prevConnection.current, status);
        prevConnection.current = status;
        setConnection(status);
      },
    );

    return cleanup;
  }, [service, applyEvent, setConnection]);

  useLayoutEffect(() => {
    appliedInitialPanelSize.current = null;
    const frame = requestAnimationFrame(() => {
      listPanelRef.current?.resize(`${currentListWidth}%`);
      appliedInitialPanelSize.current = listMode;
    });
    return () => cancelAnimationFrame(frame);
  }, [currentListWidth, listMode, listPanelRef]);

  const selectedService = info?.services.find((svc) => svc.name === service);
  const services =
    info == null
      ? fallbackServices
      : info.services.map((svc) =>
          serviceInfoFromBinding(
            svc,
            svc.name === service ? connection : "connecting",
          ),
        );
  const upstream = selectedService?.target ?? fallbackUpstream;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar services={services} onSwitchService={setService} />
      <FilterBar inputRef={filterRef} />

      <main className="min-h-0 flex-1">
        <ResizablePanelGroup
          // re-init default sizes when the mode (hence persisted width) changes
          key={listMode}
          orientation="horizontal"
          className="h-full"
        >
          <ResizablePanel
            defaultSize={`${listWidth[listMode]}%`}
            minSize="26%"
            onResize={(size) => {
              if (appliedInitialPanelSize.current !== listMode) return;
              const savedWidth = useStore.getState().listWidth[listMode];
              if (Math.abs(savedWidth - size.asPercentage) < 0.05) return;
              setListWidth(listMode, size.asPercentage);
            }}
            panelRef={listPanelRef}
            className="flex min-w-0 flex-col"
          >
            <ListToolbar />
            <ListPanel />
          </ResizablePanel>

          <ResizableHandle
            withHandle
            onDoubleClick={() => {
              const defaultWidth = DEFAULT_LIST_WIDTH_PERCENT[listMode];
              listPanelRef.current?.resize(`${defaultWidth}%`);
              setListWidth(listMode, defaultWidth);
            }}
          />

          <ResizablePanel
            defaultSize={`${100 - listWidth[listMode]}%`}
            minSize="30%"
            className="min-w-0"
          >
            <InspectorPanel
              renderBodySplit={renderBodySplit}
              renderMsearch={renderMsearch}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      <StatusBar upstream={upstream} onShowHelp={() => setHelpOpen(true)} />
      <CommandPalette onFocusFilter={() => filterRef.current?.focus()} />
      <ShortcutsOverlay />
    </div>
  );
}

const DEFAULT_LIST_WIDTH_PERCENT = { rows: 38, table: 46 } as const;

/* ── list panel: feeds the prop-driven list components from store slices ── */
function ListPanel() {
  const visibleIds = useStore(useShallow(selectVisibleIds));
  const exchanges = useStore((s) => s.exchanges);
  const total = useStore((s) => s.ids.length);
  const listMode = useStore((s) => s.listMode);
  const tz = useStore((s) => s.timeZone);
  const selectedId = useStore((s) => s.selectedId);
  const setSelectedId = useStore((s) => s.setSelectedId);
  const setHoverTraceId = useStore((s) => s.setHoverTraceId);
  const setTraceFilter = useStore((s) => s.setTraceFilter);

  const grouped = useStore((s) => s.traceGroupOn);

  if (total === 0) {
    return <EmptyState kind="first-run" />;
  }
  if (visibleIds.length === 0) {
    return <EmptyState kind="filtered" />;
  }

  const rowsForList = visibleIds
    .map((id) => exchanges.get(id))
    .filter((x): x is Exchange => x != null);

  // grouped display mode — own presentation, independent of rows/table
  if (grouped) {
    return (
      <GroupedExchangeList
        exchanges={rowsForList}
        selectedId={selectedId}
        tz={tz}
        onSelect={setSelectedId}
        onHoverTrace={setHoverTraceId}
        onFilterTrace={setTraceFilter}
      />
    );
  }

  if (listMode === "table") {
    return (
      <ExchangeTable
        exchanges={rowsForList}
        selectedId={selectedId}
        tz={tz}
        onSelect={setSelectedId}
        onHoverTrace={setHoverTraceId}
        onSelectTrace={setTraceFilter}
      />
    );
  }

  return (
    <VirtualizedRowsList
      exchanges={rowsForList}
      selectedId={selectedId}
      tz={tz}
      onSelect={setSelectedId}
    />
  );
}

function VirtualizedRowsList({
  exchanges,
  selectedId,
  tz,
  onSelect,
}: {
  exchanges: Exchange[];
  selectedId: number | null;
  tz: TimeZone;
  onSelect: (id: number) => void;
}) {
  const { density, rowPx } = useDensity();
  const scrollRef = useRef<HTMLDivElement>(null);
  // React Compiler bails out on useVirtualizer (`react-hooks/incompatible-library`).
  // This matches the existing ExchangeTable usage; the compiler is not enabled,
  // and the returned mutable API stays local to this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: exchanges.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowPx.row,
    getItemKey: (index) => `${exchanges[index]?.id ?? index}|${density}`,
    overscan: 12,
    observeElementRect: observeElementRectWithFallback,
  });

  const selectedIndex = useMemo(
    () =>
      selectedId == null
        ? -1
        : exchanges.findIndex((exchange) => exchange.id === selectedId),
    [exchanges, selectedId],
  );
  const scrolledToRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedId == null) {
      scrolledToRef.current = null;
      return;
    }
    if (selectedIndex < 0 || scrolledToRef.current === selectedId) return;
    scrolledToRef.current = selectedId;
    const handle = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(selectedIndex, { align: "center" });
    });
    return () => cancelAnimationFrame(handle);
  }, [rowPx.row, selectedId, selectedIndex, virtualizer]);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      <div
        data-testid="requests-virtualizer"
        className="relative"
        style={{ height: virtualizer.getTotalSize() }}
      >
        <div role="listbox" aria-label="Requests" className="absolute inset-0">
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const exchange = exchanges[virtualItem.index];
            if (exchange == null) return null;
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualItem.size,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <ExchangeRow
                  exchange={exchange}
                  selected={exchange.id === selectedId}
                  tz={tz}
                  onSelect={() => onSelect(exchange.id)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── inspector panel: store → Inspector props + render slots ── */
function InspectorPanel({
  renderBodySplit,
  renderMsearch,
}: {
  renderBodySplit: (x: Exchange, protocol: Protocol | null) => ReactNode;
  renderMsearch?: (
    x: Exchange,
    protocol: Protocol | null,
    view: MsearchView,
  ) => ReactNode;
}) {
  const selected = useStore(selectSelected);
  const visibleIds = useStore(useShallow(selectVisibleIds));
  const tz = useStore((s) => s.timeZone);
  const protocol = useStore((s) => s.protocol);
  const setSelectedId = useStore((s) => s.setSelectedId);
  const setTraceFilter = useStore((s) => s.setTraceFilter);

  // helpers close over store via getState (no extra subscriptions)
  function stepSelection(delta: number) {
    const s = useStore.getState();
    const ids = selectVisibleIds(s);
    const i = ids.indexOf(s.selectedId ?? -1);
    const next = ids[Math.min(Math.max(i + delta, 0), ids.length - 1)];
    if (next != null) setSelectedId(next);
  }
  function stepMatching(cur: Exchange) {
    const s = useStore.getState();
    const ids = selectVisibleIds(s);
    const start = ids.indexOf(cur.id);
    for (let k = 1; k <= ids.length; k++) {
      const cand = s.exchanges.get(ids[(start + k) % ids.length]);
      if (
        cand &&
        cand.method === cur.method &&
        (cand.uri ?? "").split("?")[0] === (cur.uri ?? "").split("?")[0]
      ) {
        setSelectedId(cand.id);
        return;
      }
    }
  }
  function stepInTrace(cur: Exchange, traceId: string) {
    const s = useStore.getState();
    const ids = selectVisibleIds(s);
    const start = ids.indexOf(cur.id);
    for (let k = 1; k <= ids.length; k++) {
      const cand = s.exchanges.get(ids[(start + k) % ids.length]);
      if (cand && cand.traceId === traceId) {
        setSelectedId(cand.id);
        return;
      }
    }
  }

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Select a request to inspect
      </div>
    );
  }

  const isMsearch = showPairsTab(protocol, selected.uri);
  const selectedIndex = visibleIds.indexOf(selected.id);
  const canStepPrev = selectedIndex > 0;
  const canStepNext =
    selectedIndex >= 0 && selectedIndex < visibleIds.length - 1;

  return (
    <div className="h-full overflow-hidden">
      <Inspector
        exchange={selected}
        tz={tz}
        isMsearch={isMsearch}
        onPrev={canStepPrev ? () => stepSelection(-1) : undefined}
        onNext={canStepNext ? () => stepSelection(1) : undefined}
        onNextMatching={() => stepMatching(selected)}
        onFilterTrace={(id) => setTraceFilter(id)}
        onCopyTrace={(id) => void navigator.clipboard.writeText(id)}
        onNextInTrace={(id) => stepInTrace(selected, id)}
        renderBodySplit={() => renderBodySplit(selected, protocol)}
        renderMsearch={
          renderMsearch
            ? (view) => renderMsearch(selected, protocol, view)
            : undefined
        }
      />
    </div>
  );
}

/* ── keyboard map ── */
function useGlobalKeys(filterRef: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);
      const s = useStore.getState();

      if (s.cmdKOpen || s.helpOpen) {
        return;
      }

      // ⌘K / Ctrl-K — toggle palette (works even while typing)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        s.setCmdKOpen(!s.cmdKOpen);
        return;
      }
      if (typing) return;

      const ids = selectVisibleIds(s);
      const move = (delta: number) => {
        if (ids.length === 0) return;
        const i = ids.indexOf(s.selectedId ?? -1);
        const ni =
          i === -1
            ? delta > 0
              ? 0
              : ids.length - 1
            : Math.min(Math.max(i + delta, 0), ids.length - 1);
        s.setSelectedId(ids[ni]);
      };

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          move(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          move(-1);
          break;
        case "/":
          e.preventDefault();
          filterRef.current?.focus();
          break;
        case "?":
          e.preventDefault();
          s.setHelpOpen(true);
          break;
        case "Escape":
          if (s.traceFilter || s.filter) {
            s.setTraceFilter(null);
            s.setFilter("");
          }
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filterRef]);
}

function serviceInfoFromBinding(
  service: Service,
  connection: ApiConnectionStatus,
): ServiceInfo {
  return {
    name: service.name,
    upstream: service.target,
    addr: service.addr,
    connection: connDotStatus(connection),
  };
}
