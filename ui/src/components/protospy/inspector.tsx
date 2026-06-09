// src/components/protospy/inspector.tsx
// Composition of the detail panel (the v2.3 scaffold shell, wired to live data —
// PRO-360 Slice 2). One shared tab strip (Bodies · Headers · Timing) spans the pane.
// msearch is an in-Bodies Paired ↔ Raw NDJSON toggle on the right of the tab strip —
// NOT a separate tab. Headers is ONE tab showing request + response side-by-side with
// counts in the pane subheads.
//
// This is a PRESENTATIONAL shell: it takes the selected live `Exchange` plus render-slot
// callbacks for the heavy body content (`renderBodySplit` / `renderMsearch`, which sibling
// slices own) and keyboard/trace callbacks the container fills from the store. The
// SSE/entity split lives inside `renderBodySplit` (the live BodySplit, which owns the
// stream pane since PRO-361), so this shell only chooses the tab label and the
// msearch-vs-bodies content.

"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import { cn, formatAbsoluteTime } from "@ui/lib/utils";
import type { TimeZone } from "@ui/lib/utils";
import { fmtBytes, fmtMs } from "@ui/lib/format";
import { isSSEExchange } from "@ui/lib/exchange";
import type { BodyState, Exchange } from "@ui/state/reducer";
import { MethodBadge } from "./method-badge";
import { StatusCode } from "./status-code";
import { TraceTag } from "./trace-tag";
import { HeadersPane } from "./headers-pane";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@ui/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@ui/components/ui/toggle-group";
import { Button } from "@ui/components/ui/button";

type BodyTab = "bodies" | "headers" | "timing";
export type MsearchView = "paired" | "raw";

export interface InspectorProps {
  exchange: Exchange;
  tz?: TimeZone;
  /** Whether to surface the msearch Paired ↔ Raw toggle + view (protocol-gated). */
  isMsearch?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onNextMatching?: () => void;
  onFilterTrace?: (id: string) => void;
  onCopyTrace?: (id: string) => void;
  onNextInTrace?: (id: string) => void;
  /** Slots for the heavy content, kept out of this composition shell. */
  renderBodySplit: () => React.ReactNode;
  renderMsearch?: (view: MsearchView) => React.ReactNode;
}

export function Inspector({
  exchange: x,
  tz = "local",
  isMsearch = false,
  onPrev,
  onNext,
  onNextMatching,
  onFilterTrace,
  onCopyTrace,
  onNextInTrace,
  renderBodySplit,
  renderMsearch,
}: InspectorProps) {
  const [tab, setTab] = useState<BodyTab>("bodies");
  const [msView, setMsView] = useState<MsearchView>("paired");
  const showMsearch = isMsearch && renderMsearch != null;

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <ContextBar
        x={x}
        onPrev={onPrev}
        onNext={onNext}
        onNextMatching={onNextMatching}
        onFilterTrace={onFilterTrace}
        onCopyTrace={onCopyTrace}
        onNextInTrace={onNextInTrace}
      />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as BodyTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="flex items-center border-b px-gutter-x">
          <TabsList
            data-testid="inspector-tab-list"
            className="h-tab gap-0.5 bg-transparent p-0"
          >
            <UnderlineTab value="bodies">
              {isSSEExchange(x) ? "Stream" : "Bodies"}
            </UnderlineTab>
            <UnderlineTab value="headers">Headers</UnderlineTab>
            <UnderlineTab value="timing">Timing</UnderlineTab>
          </TabsList>
          {/* Paired ↔ Raw NDJSON toggle — only for msearch, only on the Bodies tab */}
          {showMsearch && tab === "bodies" && (
            <ToggleGroup
              type="single"
              value={msView}
              onValueChange={(v) => v && setMsView(v as MsearchView)}
              size="sm"
              className="ml-auto"
              aria-label="msearch body view"
            >
              <ToggleGroupItem value="paired">Paired</ToggleGroupItem>
              <ToggleGroupItem value="raw">Raw NDJSON</ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

        <TabsContent value="bodies" className="min-h-0 flex-1 overflow-hidden">
          {showMsearch ? renderMsearch!(msView) : renderBodySplit()}
        </TabsContent>

        <TabsContent value="headers" className="min-h-0 flex-1 overflow-hidden">
          <div className="grid h-full grid-cols-2 gap-px overflow-hidden bg-border">
            <HeadersPane
              title="Request"
              headers={x.requestHeaders ?? []}
              emptyMessage="No request headers captured"
              testId="headers-panel-request"
            />
            <HeadersPane
              title="Response"
              headers={x.responseHeaders ?? []}
              emptyMessage="No response headers captured"
              testId="headers-panel-response"
            />
          </div>
        </TabsContent>

        <TabsContent value="timing" className="min-h-0 flex-1 overflow-auto">
          <TimingFacts x={x} tz={tz} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── context bar ── */
function ContextBar({
  x,
  onPrev,
  onNext,
  onNextMatching,
  onFilterTrace,
  onCopyTrace,
  onNextInTrace,
}: {
  x: Exchange;
  onPrev?: () => void;
  onNext?: () => void;
  onNextMatching?: () => void;
  onFilterTrace?: (id: string) => void;
  onCopyTrace?: (id: string) => void;
  onNextInTrace?: (id: string) => void;
}) {
  const hasError = x.error != null;
  return (
    <div className="flex h-ctxbar items-center gap-2.5 border-b bg-card px-gutter-x">
      <div className="flex shrink-0 gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onPrev}
          disabled={onPrev == null}
          aria-label="Previous request"
          className="text-muted-foreground"
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNext}
          disabled={onNext == null}
          aria-label="Next request"
          className="text-muted-foreground"
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>
      <MethodBadge method={x.method} size="md" />
      <PathDisplay uri={x.uri ?? "/"} onNextMatching={onNextMatching} />
      <StatusCode
        className="ml-auto shrink-0"
        status={x.status}
        hasError={hasError}
        title={x.error?.message}
      />
      {x.elapsedMs != null && (
        <span className="shrink-0 rounded-full border bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {fmtMs(x.elapsedMs)}
        </span>
      )}
      {x.traceId && (
        <TraceTag
          traceId={x.traceId}
          onFilter={() => onFilterTrace?.(x.traceId!)}
          onCopy={() => onCopyTrace?.(x.traceId!)}
          onNext={() => onNextInTrace?.(x.traceId!)}
        />
      )}
    </div>
  );
}

// path + query string with per-part token coloring; truncates, never the metadata.
function PathDisplay({
  uri,
  onNextMatching,
}: {
  uri: string;
  onNextMatching?: () => void;
}) {
  const [path, query] = uri.split("?");
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-nowrap font-mono text-[length:calc(var(--text-mono)+1px)] text-foreground">
      <span className="truncate">{path}</span>
      {query && (
        <span className="truncate text-muted-foreground">
          ?
          {query.split("&").map((kv, i) => {
            const [k, v] = kv.split("=");
            return (
              <span key={i}>
                {i > 0 && <span className="text-muted-foreground">&</span>}
                <span className="text-accent-foreground">{k}</span>
                {v != null && (
                  <>
                    <span className="text-muted-foreground">=</span>
                    <span className="text-secondary-foreground">{v}</span>
                  </>
                )}
              </span>
            );
          })}
        </span>
      )}
      {onNextMatching && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onNextMatching}
          aria-label="Next request with same method + path"
          className="text-muted-foreground"
        >
          <ChevronRight className="size-3.5" />
        </Button>
      )}
    </span>
  );
}

/**
 * Render one side's body size as `wire / decoded (encoding)` when the body is
 * compressed and the decode pipeline has cached `decodedBytes`, `wire (encoding)`
 * when it hasn't, or plain `wire` when uncompressed. Em dash when there's no body.
 * Chrome-DevTools slash convention; kept deviation §3 (dual wire/decoded size).
 */
function bodyBytes(body: BodyState | undefined): React.ReactNode {
  if (body == null) return "—";
  const { wireBytes: wire, decodedBytes: decoded, contentEncoding: enc } = body;
  const dual = enc && decoded != null && decoded !== wire;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span>
        {dual ? `${fmtBytes(wire)} / ${fmtBytes(decoded)}` : fmtBytes(wire)}
      </span>
      {enc && <span className="text-muted-foreground">({enc})</span>}
    </span>
  );
}

// Facts only — standardized on "bytes". No synthetic upstream/proxy waterfall: the
// backend doesn't report a proxy breakdown, so inventing a 70/30 split would lie
// (design-system hard rule 14).
function TimingFacts({ x, tz }: { x: Exchange; tz: TimeZone }) {
  const status: React.ReactNode =
    x.status ?? (x.error ? x.error.message : "pending");
  const rows: [string, React.ReactNode][] = [
    ["Started", formatAbsoluteTime(x.timestamp, tz)],
    ["HTTP version", x.version ?? "—"],
    ["Method", x.method ?? "—"],
    ["Status", status],
    ["Elapsed", fmtMs(x.elapsedMs ?? null)],
    ["Request bytes", bodyBytes(x.requestBody)],
    ["Response bytes", bodyBytes(x.responseBody)],
    ["Trace ID", x.traceId ?? "—"],
  ];
  return (
    <table className="w-full border-collapse font-mono text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b">
            <td className="w-[40%] px-3 py-1.5 text-muted-foreground">{k}</td>
            <td className="px-3 py-1.5 text-foreground">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UnderlineTab({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        "h-tab rounded-none border-b-2 border-transparent bg-transparent px-3 text-sm font-medium text-muted-foreground shadow-none",
        "data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none",
      )}
    >
      {children}
    </TabsTrigger>
  );
}
