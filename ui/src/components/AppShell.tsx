import { useEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useStore } from "@ui/state/store";
import { fetchInfo } from "@ui/api/info";
import type { Info } from "@ui/api/info";
import { subscribeToEvents } from "@ui/api/sse";
import { TopBar } from "./TopBar";
import { FilterBar } from "./FilterBar";
import { ExchangeList } from "./ExchangeList";
import { Inspector } from "./Inspector";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";

export function AppShell() {
  const applyEvent = useStore((s) => s.applyEvent);
  const setConnection = useStore((s) => s.setConnection);
  const setService = useStore((s) => s.setService);
  const service = useStore((s) => s.service);

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
          <ExchangeList />
        </Panel>
        <Separator className="w-px bg-border shrink-0 cursor-col-resize hover:bg-accent transition-colors" />
        <Panel>
          <Inspector />
        </Panel>
      </Group>
      <StatusBar />
      <CommandPalette />
    </div>
  );
}
