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
// v2.4 ingest (PRO-363): un-wired. Imported by nothing live yet — App.tsx still
// renders the legacy `components/AppShell`. This shell is reconciled against the
// LIVE store/sibling contracts so it type-checks in the tree: density is
// store-backed (no DensityProvider), the content `Exchange` is the reducer model
// (`@ui/state/reducer`, not the scaffold `lib/types`), and the list/inspector
// prop wiring follows the adapted live components (PRO-359/360/361). The shell
// wire slice will mount it and own the live behaviour.

"use client";

import { useEffect, useRef, type ReactNode } from "react";
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
} from "@/components/ui/resizable";

export interface AppShellProps {
  /** Configured services for the picker (app/config-owned). */
  services?: ServiceInfo[];
  /** Upstream URL for the status bar (config-owned). */
  upstream?: string;

  // ── inspector heavy-content slots (app-owned; see inspector.tsx) ──
  // The live `Inspector` exposes two slots — the split body view and the
  // (optional) paired msearch view; the JsonViewer/stream viewers live inside
  // `BodySplit`, so the shell never threads a `renderBody`/`renderStream` slot.
  renderBodySplit: (x: Exchange) => ReactNode;
  renderMsearch?: (x: Exchange, view: MsearchView) => ReactNode;
}

export function AppShell(props: AppShellProps) {
  // Density is store-backed (a `subscribeWithSelector` subscription writes
  // `<html data-density>`); `useDensity()` reads it. No DensityProvider needed.
  return <ShellInner {...props} />;
}

function ShellInner({
  services,
  upstream,
  renderBodySplit,
  renderMsearch,
}: AppShellProps) {
  const filterRef = useRef<HTMLInputElement>(null);
  const listMode = useStore((s) => s.listMode);
  const setListWidth = useStore((s) => s.setListWidth);
  const listWidth = useStore((s) => s.listWidth);
  const setHelpOpen = useStore((s) => s.setHelpOpen);

  useGlobalKeys(filterRef);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar services={services} />
      <FilterBar inputRef={filterRef} />

      <main className="min-h-0 flex-1">
        <ResizablePanelGroup
          // re-init default sizes when the mode (hence persisted width) changes
          key={listMode}
          orientation="horizontal"
          className="h-full"
        >
          <ResizablePanel
            defaultSize={listWidth[listMode]}
            minSize={26}
            onResize={(size) => setListWidth(listMode, size.inPixels)}
            className="flex min-w-0 flex-col"
          >
            <ListToolbar />
            <ListPanel />
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel minSize={30} className="min-w-0">
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

/* ── list panel: feeds the prop-driven list components from store slices ── */
function ListPanel() {
  const visibleIds = useStore(selectVisibleIds);
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
      />
    );
  }

  // rows mode (secondary view). Production virtualizes this list too; kept plain
  // here so the shell stays content-agnostic.
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {rowsForList.map((x) => (
        <ExchangeRow
          key={x.id}
          exchange={x}
          selected={x.id === selectedId}
          tz={tz}
          onSelect={() => setSelectedId(x.id)}
        />
      ))}
    </div>
  );
}

/* ── inspector panel: store → Inspector props + render slots ── */
function InspectorPanel({
  renderBodySplit,
  renderMsearch,
}: {
  renderBodySplit: (x: Exchange) => ReactNode;
  renderMsearch?: (x: Exchange, view: MsearchView) => ReactNode;
}) {
  const selected = useStore(selectSelected);
  const tz = useStore((s) => s.timeZone);
  const protocol = useStore((s) => s.protocol);
  const setSelectedId = useStore((s) => s.setSelectedId);
  const setTraceFilter = useStore((s) => s.setTraceFilter);

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
        onPrev={() => stepSelection(-1)}
        onNext={() => stepSelection(1)}
        onNextMatching={() => stepMatching(selected)}
        onFilterTrace={(id) => setTraceFilter(id)}
        onCopyTrace={(id) => void navigator.clipboard.writeText(id)}
        onNextInTrace={(id) => stepInTrace(selected, id)}
        renderBodySplit={() => renderBodySplit(selected)}
        renderMsearch={
          renderMsearch ? (view) => renderMsearch(selected, view) : undefined
        }
      />
    </div>
  );

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

      // ⌘K / Ctrl-K — toggle palette (works even while typing)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const s = useStore.getState();
        s.setCmdKOpen(!s.cmdKOpen);
        return;
      }
      if (typing) return;

      const s = useStore.getState();
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
