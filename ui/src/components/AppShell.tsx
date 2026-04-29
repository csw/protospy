import { useEffect, useState } from "react";
import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/store";
import { fetchInfo } from "@ui/api/info";
import { subscribeToEvents } from "@ui/api/sse";
import { TopBar } from "./TopBar";
import { ExchangeList } from "./ExchangeList";
import { Inspector } from "./Inspector";
import { StatusBar } from "./StatusBar";

export function AppShell() {
  const exchanges = useStore((s) => s.exchanges);
  const ids = useStore((s) => s.ids);
  const connection = useStore((s) => s.connection);
  const service = useStore((s) => s.service);
  const applyEvent = useStore((s) => s.applyEvent);
  const setConnection = useStore((s) => s.setConnection);
  const setService = useStore((s) => s.setService);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Fetch /info on mount, pick first service, subscribe to SSE
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    fetchInfo()
      .then((info) => {
        if (cancelled) return;
        const svc = info.services[0];
        if (svc == null) return;

        setService(svc.name);

        cleanup = subscribeToEvents(
          svc.name,
          (msg) => applyEvent(msg),
          (status) => setConnection(status),
        );
      })
      .catch(() => {
        // /info failed — stay in "connecting" state, will retry on page refresh
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [applyEvent, setConnection, setService]);

  // Build the exchange list in order
  const exchangeList = ids
    .map((id) => exchanges.get(id))
    .filter((ex): ex is Exchange => ex != null);

  // Derive effective selection: use selectedId if set, otherwise auto-select first
  const effectiveId = selectedId ?? ids[0] ?? null;
  const selectedExchange =
    effectiveId != null ? (exchanges.get(effectiveId) ?? null) : null;

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-bg">
      <TopBar service={service} />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[260px] shrink-0 overflow-hidden">
          <ExchangeList
            exchanges={exchangeList}
            selectedId={effectiveId}
            onSelect={setSelectedId}
          />
        </div>
        <Inspector exchange={selectedExchange} />
      </div>
      <StatusBar
        connection={connection}
        service={service}
        exchangeCount={ids.length}
      />
    </div>
  );
}
