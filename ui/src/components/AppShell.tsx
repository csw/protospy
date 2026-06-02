import { useCallback, useEffect, useRef, useState } from "react";
import {
  Group,
  Panel,
  Separator,
  usePanelRef,
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

/** Default list-pane widths (px) by mode — must match the store defaults. */
export const DEFAULT_LIST_WIDTH = { rows: 340, table: 720 } as const;

/**
 * List/inspector pane size bounds passed to `react-resizable-panels`.
 *
 * These are the real guard against the too-narrow / too-wide failure modes —
 * a visual review can flag clipping, but only the panel `minSize`/`maxSize`
 * constraints actually prevent it (drag, double-click, and persisted-width
 * restore all flow through them).
 *
 * - `LIST_MIN_WIDTH` (px): floor for the list pane so its rows/table columns
 *   never clip.
 * - `LIST_MAX_WIDTH` (% of the group): cap so the list can't be dragged so wide
 *   it dominates the viewport and starves the inspector. A percentage (not px)
 *   keeps the cap viewport-relative across the 1280/1440/1920 review widths.
 * - `INSPECTOR_MIN_WIDTH` (px): floor for the inspector pane so its content
 *   (headers split, bodies, timing) can't be collapsed to near-zero. This is
 *   the guard called out in the PRO-234 review; without it the inspector Panel
 *   fell back to the library's built-in floor.
 *
 * The two bounds are mutually consistent at the narrowest supported width
 * (1280px): `LIST_MAX_WIDTH` (≈832px) leaves ≈447px for the inspector, above
 * `INSPECTOR_MIN_WIDTH`.
 */
export const LIST_MIN_WIDTH = 200;
export const LIST_MAX_WIDTH = "65%";
export const INSPECTOR_MIN_WIDTH = 400;

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
  const listPanelRef = usePanelRef();

  const handleListPanelResize = useCallback(
    (size: PanelSize) => {
      if (interacting.current) {
        setListWidth(listMode, size.inPixels);
      }
    },
    [listMode, setListWidth],
  );

  const handleSeparatorDoubleClick = useCallback(() => {
    const defaultWidth = DEFAULT_LIST_WIDTH[listMode];
    listPanelRef.current?.resize(defaultWidth);
    setListWidth(listMode, defaultWidth);
    // listPanelRef is a stable RefObject from usePanelRef — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listMode, setListWidth]);

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
          minSize={LIST_MIN_WIDTH}
          maxSize={LIST_MAX_WIDTH}
          onResize={handleListPanelResize}
          panelRef={listPanelRef}
        >
          <ExchangeList />
        </Panel>
        <Separator
          className="w-px bg-border shrink-0 cursor-col-resize hover:bg-accent transition-colors"
          onDoubleClick={handleSeparatorDoubleClick}
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
        <Panel minSize={INSPECTOR_MIN_WIDTH}>
          <Inspector />
        </Panel>
      </Group>
      <StatusBar />
      <CommandPalette />
    </div>
  );
}
