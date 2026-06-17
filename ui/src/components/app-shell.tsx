// src/components/protospy/app-shell.tsx
// The page composition. This is the ONE place that bridges the store to the
// content components: the chrome (top/filter/status/list-toolbar/palette) reads
// & writes the store itself, while the prop-driven content pieces (ExchangeTable,
// ExchangeRow, Inspector) are fed derived slices here. Heavy body renderers
// (the JSON viewer, stream, msearch) stay app-owned and arrive as render slots —
// the shell never imports a body viewer.
//
// Owns: the resizable list↔inspector split (width persists per list-mode) and
// the global keyboard map (j/k/↑/↓ select, ⌘K palette, / filter, ? help).
//
// v2.4 shell wire-up (PRO-357): App.tsx mounts this shell as the live outer
// layer. It keeps the app-owned reducer/SSE/body plumbing but adopts the
// scaffold chrome, keyboard map, and pixel-based panel behavior.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import {
  useStore,
  selectVisibleIds,
  selectSelected,
  useVisibleExchanges,
} from "@ui/state/store";
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
import { Inspector } from "./inspector";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@ui/components/ui/resizable";

const RESIZE_HANDLE_WIDTH_PX = 1;
const MAX_INITIAL_LIST_SHARE = 0.5;
const LIST_MIN_WIDTH_PX = 26;
const INSPECTOR_MIN_WIDTH_PX = 30;

export interface AppShellProps {
  /** Configured services for the picker (app/config-owned). */
  services?: ServiceInfo[];
  /** Upstream URL for the status bar (config-owned). */
  upstream?: string;

  // ── inspector heavy-content slots (app-owned; see inspector.tsx) ──
  // The live `Inspector` exposes two slots — the split body view and the
  // (optional) paired msearch view; the JSON/stream viewers live inside
  // `BodySplit`, so the shell never threads a `renderBody`/`renderStream` slot.
  renderBodySplit: (x: Exchange, protocol: Protocol | null) => ReactNode;
  renderMsearch?: (x: Exchange, protocol: Protocol | null) => ReactNode;
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
  const resizing = useRef(false);
  const prevConnection = useRef<ApiConnectionStatus | null>(null);
  const [info, setInfo] = useState<Info | null>(null);

  const applyEvent = useStore((s) => s.applyEvent);
  const setConnection = useStore((s) => s.setConnection);
  const setService = useStore((s) => s.setService);
  const setProtocol = useStore((s) => s.setProtocol);
  const service = useStore((s) => s.service);
  const connection = useStore((s) => s.connection);
  const listMode = useStore((s) => s.listMode);
  const setListWidth = useStore((s) => s.setListWidth);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  // The panel `defaultSize` must stay STABLE for the lifetime of each panel-group
  // mount. The group remounts whenever `listMode` changes (key={listMode}), so we
  // read the persisted width for the active mode once here, non-reactively.
  //
  // Crucially we do NOT depend on the live `listWidth` slice: `onResize` writes
  // the dragged width back to the store during a drag, and if that fed back into
  // `defaultSize`, the list Panel would re-register mid-drag (react-resizable-panels
  // keys its registration effect on `defaultSize`), making the Group snap its layout
  // back toward the default. That aborts the gesture after a few pixels — the
  // first-drag stutter (PRO-402). Persisting still happens for the next mount/reload.
  const initialPanelSizes = useMemo(
    () => getInitialPanelSizes(useStore.getState().listWidth[listMode]),
    [listMode],
  );

  useGlobalKeys(filterRef);

  useEffect(() => {
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
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
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
            defaultSize={initialPanelSizes.list}
            groupResizeBehavior="preserve-pixel-size"
            minSize={LIST_MIN_WIDTH_PX}
            onResize={(size) => {
              if (resizing.current) setListWidth(listMode, size.inPixels);
            }}
            className="flex min-w-0 flex-col"
          >
            <ListToolbar />
            <ListPanel />
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className="items-start [&>div]:mt-ctxbar"
            onPointerDown={() => {
              resizing.current = true;
            }}
            onPointerUp={() => {
              resizing.current = false;
            }}
            onKeyDown={(event) => {
              if (
                event.key === "ArrowLeft" ||
                event.key === "ArrowRight" ||
                event.key === "Home" ||
                event.key === "End"
              ) {
                resizing.current = true;
              }
            }}
            onKeyUp={() => {
              resizing.current = false;
            }}
            onBlur={() => {
              resizing.current = false;
            }}
          />

          <ResizablePanel
            defaultSize={initialPanelSizes.inspector}
            minSize={INSPECTOR_MIN_WIDTH_PX}
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

function getInitialPanelSizes(listWidth: number): {
  list: number;
  inspector: number | undefined;
} {
  const viewportWidth =
    typeof window === "undefined"
      ? undefined
      : (window.visualViewport?.width ?? window.innerWidth);

  if (viewportWidth == null || !Number.isFinite(viewportWidth)) {
    return { list: listWidth, inspector: undefined };
  }

  const available = Math.max(0, viewportWidth - RESIZE_HANDLE_WIDTH_PX);
  const maxListWidth = Math.max(
    LIST_MIN_WIDTH_PX,
    Math.min(
      Math.floor(viewportWidth * MAX_INITIAL_LIST_SHARE),
      available - INSPECTOR_MIN_WIDTH_PX,
    ),
  );
  const list = Math.max(LIST_MIN_WIDTH_PX, Math.min(listWidth, maxListWidth));

  return {
    list,
    inspector: Math.max(INSPECTOR_MIN_WIDTH_PX, available - list),
  };
}

/* ── list panel: feeds the prop-driven list components from store slices ── */
function ListPanel() {
  const visibleExchanges = useVisibleExchanges();
  const total = useStore((s) => s.ids.length);
  const listMode = useStore((s) => s.listMode);
  const tz = useStore((s) => s.timeZone);
  const selectedId = useStore((s) => s.selectedId);
  const setSelectedId = useStore((s) => s.setSelectedId);
  const setHoverTraceId = useStore((s) => s.setHoverTraceId);
  const setTraceFilter = useStore((s) => s.setTraceFilter);
  const connection = useStore((s) => s.connection);

  const grouped = useStore((s) => s.traceGroupOn);

  // Delay the connecting affordance so the normal sub-10ms initial connection
  // never flashes it. Only genuine reconnects (300ms+) will cross the threshold.
  const [showConnecting, setShowConnecting] = useState(false);
  useEffect(() => {
    if (connDotStatus(connection) !== "connecting") return;
    const id = setTimeout(() => setShowConnecting(true), 300);
    return () => {
      clearTimeout(id);
      setShowConnecting(false);
    };
  }, [connection]);

  if (total === 0) {
    return <EmptyState kind={showConnecting ? "connecting" : "first-run"} />;
  }
  if (visibleExchanges.length === 0) {
    return <EmptyState kind="filtered" />;
  }

  const rowsForList = visibleExchanges;

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
  renderMsearch?: (x: Exchange, protocol: Protocol | null) => ReactNode;
}) {
  const selected = useStore(selectSelected);
  const tz = useStore((s) => s.timeZone);
  const protocol = useStore((s) => s.protocol);
  const setSelectedId = useStore((s) => s.setSelectedId);
  const setTraceFilter = useStore((s) => s.setTraceFilter);

  // Stable nav callbacks — read current store state at call time via getState()
  // so they don't close over any rendered snapshot; only setSelectedId (Zustand
  // stable) is in the deps, making the references stable across renders.
  const onPrev = useCallback(() => {
    const s = useStore.getState();
    const ids = selectVisibleIds(s);
    const i = ids.indexOf(s.selectedId ?? -1);
    const next = ids[Math.min(Math.max(i - 1, 0), ids.length - 1)];
    if (next != null) setSelectedId(next);
  }, [setSelectedId]);

  const onNext = useCallback(() => {
    const s = useStore.getState();
    const ids = selectVisibleIds(s);
    const i = ids.indexOf(s.selectedId ?? -1);
    const next = ids[Math.min(Math.max(i + 1, 0), ids.length - 1)];
    if (next != null) setSelectedId(next);
  }, [setSelectedId]);

  const onNextMatching = useCallback(
    (cur: Exchange) => {
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
    },
    [setSelectedId],
  );

  const onNextInTrace = useCallback(
    (cur: Exchange, traceId: string) => {
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
    },
    [setSelectedId],
  );

  const onCopyTrace = useCallback(
    (id: string) => void navigator.clipboard.writeText(id),
    [],
  );

  const renderBodySplitCb = useCallback(
    // selected is null-guarded before Inspector is rendered; the ! is safe
    // because this callback is only passed to Inspector after the null check.
    () => renderBodySplit(selected!, protocol),
    [renderBodySplit, selected, protocol],
  );

  // Wraps the optional outer prop so the reference only changes when its deps
  // change, not on every InspectorPanel render.
  const renderMsearchCb = useCallback(
    () => renderMsearch?.(selected!, protocol),
    [renderMsearch, selected, protocol],
  );

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Select a request to inspect
      </div>
    );
  }

  const isMsearch = showPairsTab(protocol, selected.uri);
  return (
    <div className="h-full overflow-hidden">
      <Inspector
        exchange={selected}
        tz={tz}
        isMsearch={isMsearch}
        onPrev={onPrev}
        onNext={onNext}
        onNextMatching={onNextMatching}
        onFilterTrace={setTraceFilter}
        onCopyTrace={onCopyTrace}
        onNextInTrace={onNextInTrace}
        renderBodySplit={renderBodySplitCb}
        renderMsearch={renderMsearch ? renderMsearchCb : undefined}
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

      // ⌘K / Ctrl-K — toggle palette (works even while typing)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!s.helpOpen) {
          s.setCmdKOpen(!s.cmdKOpen);
        }
        return;
      }

      if (s.cmdKOpen || s.helpOpen) {
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
