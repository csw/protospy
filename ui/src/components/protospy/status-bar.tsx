// src/components/protospy/status-bar.tsx
// App chrome footer. Reads connection / service / counts straight from the
// store. The upstream URL is config-owned (the store holds the service *name*,
// not its address), so it's passed in. Shortcuts hint opens the help overlay.

"use client";

import { useStore, selectTraceCount } from "@ui/state/store";
import {
  ConnectionDot,
  CONNECTION_LABEL,
  connDotStatus,
} from "./connection-dot";
import { Separator } from "@/components/ui/separator";

export interface StatusBarProps {
  /** Full upstream URL for the selected service, e.g. "http://localhost:9200". Config-owned. */
  upstream?: string;
  onShowHelp?: () => void;
}

export function StatusBar({ upstream, onShowHelp }: StatusBarProps) {
  const connection = connDotStatus(useStore((s) => s.connection));
  const traceCount = useStore(selectTraceCount);
  const total = useStore((s) => s.ids.length);
  const selectedId = useStore((s) => s.selectedId);

  return (
    <footer className="flex h-statusbar shrink-0 items-center gap-3 border-t bg-card px-gutter-x font-mono text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <ConnectionDot status={connection} />
        {CONNECTION_LABEL[connection]}
      </span>

      {upstream && (
        <>
          <Separator orientation="vertical" className="h-3" />
          <span className="truncate">{upstream}</span>
        </>
      )}

      <span className="ml-auto inline-flex items-center gap-3">
        <span>
          {total} {total === 1 ? "request" : "requests"}
        </span>
        <span aria-hidden className="text-border-strong">
          ·
        </span>
        <span>
          {traceCount} {traceCount === 1 ? "trace" : "traces"}
        </span>
        {selectedId != null && (
          <>
            <span aria-hidden className="text-border-strong">
              ·
            </span>
            <span className="text-secondary-foreground">#{selectedId}</span>
          </>
        )}
        <Separator orientation="vertical" className="h-3" />
        <button
          type="button"
          onClick={onShowHelp}
          className="inline-flex items-center gap-1.5 hover:text-foreground"
        >
          <kbd className="rounded border border-b-2 bg-secondary px-1.5 py-px text-[10.5px]">
            ?
          </kbd>
          shortcuts
        </button>
      </span>
    </footer>
  );
}
