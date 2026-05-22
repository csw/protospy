import { useCallback, useEffect, useRef, useState } from "react";
import {
  Group,
  Panel,
  Separator,
  type PanelSize,
} from "react-resizable-panels";
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
  const setProtocol = useStore((s) => s.setProtocol);
  const service = useStore((s) => s.service);
  const listMode = useStore((s) => s.listMode);
  const listWidth = useStore((s) => s.listWidth);
  const setListWidth = useStore((s) => s.setListWidth);

  // Pixel-based persistence via Zustand rather than useDefaultLayout, which
  // stores percentage-based Layout objects incompatible with fixed-width,
  // mode-dependent panel sizing. See decision doc for rationale.
  const interacting = useRef(false);

  const handleListPanelResize = useCallback(
    (size: PanelSize) => {
      if (interacting.current) {
        setListWidth(listMode, size.inPixels);
      }
    },
    [listMode, setListWidth],
  );

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
        setProtocol(svc.protocol);
      })
      .catch(() => {
        // /info failed — stay in "connecting" state, will retry on page refresh
      });

    return () => {
      cancelled = true;
    };
  }, [setService, setProtocol]);

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
    const svc = info?.services.find((s) => s.name === name);
    setProtocol(svc?.protocol ?? null);
  }

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-bg">
      <TopBar
        services={info?.services ?? []}
        onSwitchService={handleSwitchService}
      />
      <FilterBar />
      <Group orientation="horizontal" className="flex-1 overflow-hidden">
        <Panel
          defaultSize={listWidth[listMode]}
          minSize={200}
          onResize={handleListPanelResize}
        >
          <ExchangeList />
        </Panel>
        <Separator
          className="w-px bg-border shrink-0 cursor-col-resize hover:bg-accent transition-colors"
          onPointerDown={() => {
            interacting.current = true;
          }}
          onPointerUp={() => {
            interacting.current = false;
          }}
          onKeyDown={(e) => {
            if (
              e.key === "ArrowLeft" ||
              e.key === "ArrowRight" ||
              e.key === "Home" ||
              e.key === "End"
            ) {
              interacting.current = true;
            }
          }}
          onKeyUp={() => {
            interacting.current = false;
          }}
          onBlur={() => {
            interacting.current = false;
          }}
        />
        <Panel>
          <Inspector />
        </Panel>
      </Group>
      <StatusBar />
      <CommandPalette />
    </div>
  );
}
