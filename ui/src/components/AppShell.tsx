import { useEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/store";
import { fetchInfo } from "@ui/api/info";
import type { Info } from "@ui/api/info";
import { subscribeToEvents } from "@ui/api/sse";
import { TopBar } from "./TopBar";
import { FilterBar } from "./FilterBar";
import { ExchangeList } from "./ExchangeList";
import { Inspector } from "./Inspector";
import { StatusBar } from "./StatusBar";

export function AppShell() {
  const exchanges = useStore((s) => s.exchanges);
  const ids = useStore((s) => s.ids);
  const applyEvent = useStore((s) => s.applyEvent);
  const setConnection = useStore((s) => s.setConnection);
  const setService = useStore((s) => s.setService);
  const service = useStore((s) => s.service);
  const selectedId = useStore((s) => s.selectedId);
  const setSelectedId = useStore((s) => s.setSelectedId);
  const cmdKOpen = useStore((s) => s.cmdKOpen);
  const setCmdKOpen = useStore((s) => s.setCmdKOpen);

  const [info, setInfo] = useState<Info | null>(null);

  // Effect A: fetch /info once on mount, pick first service
  useEffect(() => {
    let cancelled = false;

    fetchInfo()
      .then((fetchedInfo) => {
        if (cancelled) return;
        setInfo(fetchedInfo);
        const svc = fetchedInfo.services[0];
        if (svc == null) return;
        setService(svc.name);
      })
      .catch(() => {
        // /info failed — stay in "connecting" state, will retry on page refresh
      });

    return () => {
      cancelled = true;
    };
  }, [setService]);

  // Effect B: subscribe to SSE whenever service changes
  useEffect(() => {
    if (service == null) return;

    const cleanup = subscribeToEvents(
      service,
      (msg) => applyEvent(msg),
      (status) => setConnection(status),
    );

    return cleanup;
    // applyEvent and setConnection are stable Zustand refs — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  // Keyboard navigation: j/k/↑/↓ for exchange list, ⌘K for command palette
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // ⌘K / Ctrl+K: toggle command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdKOpen(!cmdKOpen);
        return;
      }

      // Skip navigation when focus is in an input or command palette is open
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (cmdKOpen) return;

      // j/↓: next exchange; k/↑: previous exchange
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const effectiveId = selectedId ?? ids[0] ?? null;
        if (effectiveId == null || ids.length === 0) return;
        const idx = ids.indexOf(effectiveId);
        const next = idx < ids.length - 1 ? ids[idx + 1] : null;
        if (next != null) setSelectedId(next);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const effectiveId = selectedId ?? ids[0] ?? null;
        if (effectiveId == null || ids.length === 0) return;
        const idx = ids.indexOf(effectiveId);
        const prev = idx > 0 ? ids[idx - 1] : null;
        if (prev != null) setSelectedId(prev);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ids, selectedId, setSelectedId, cmdKOpen, setCmdKOpen]);

  // Build the exchange list in order
  const exchangeList = ids
    .map((id) => exchanges.get(id))
    .filter((ex): ex is Exchange => ex != null);

  // Derive effective selection: use selectedId if set, otherwise auto-select first
  const effectiveId = selectedId ?? ids[0] ?? null;
  const selectedExchange =
    effectiveId != null ? (exchanges.get(effectiveId) ?? null) : null;

  function handleSwitchService(name: string) {
    setService(name);
  }

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-bg">
      <TopBar
        services={info?.services ?? []}
        onSwitchService={handleSwitchService}
      />
      <FilterBar />
      <Group orientation="horizontal" className="flex-1 overflow-hidden">
        <Panel defaultSize={300} minSize={200}>
          <ExchangeList
            exchanges={exchangeList}
            selectedId={effectiveId}
            onSelect={setSelectedId}
          />
        </Panel>
        <Separator className="w-px bg-border shrink-0 cursor-col-resize hover:bg-accent transition-colors" />
        <Panel>
          <Inspector exchange={selectedExchange} />
        </Panel>
      </Group>
      <StatusBar />
    </div>
  );
}
