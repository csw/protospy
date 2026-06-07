// src/components/protospy/inspector.tsx
// Composition of the detail panel. One shared tab strip (Bodies · Headers · Timing)
// spans both panes. msearch is an in-Bodies Paired ↔ Raw NDJSON toggle that lives
// on the right of the tab strip — NOT a separate tab. Headers is ONE tab showing
// request + response side-by-side with counts in the pane subheads.

"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtBytes, fmtMs } from "@/lib/format";
import type { Exchange, Header } from "@/lib/types";
import { MethodBadge } from "./method-badge";
import { StatusCode } from "./status-code";
import { TraceTag } from "./trace-tag";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
// PRO-341: the v2.3 scaffold imported Tooltip/TooltipContent/TooltipTrigger but
// never used them; dropped to satisfy noUnusedLocals. PRO-345 can reintroduce if
// the inspector grows tooltips when wired.

type BodyTab = "bodies" | "headers" | "timing";
type MsearchView = "paired" | "raw";

export interface InspectorProps {
  exchange: Exchange;
  tz?: "local" | "utc";
  onPrev?: () => void;
  onNext?: () => void;
  onNextMatching?: () => void;
  onFilterTrace?: (id: string) => void;
  /** Slots for the heavy content, kept out of this composition shell. */
  renderBodySplit: () => React.ReactNode;
  renderMsearch?: (view: MsearchView) => React.ReactNode;
  renderStream?: () => React.ReactNode;
  renderBody: (text: string) => React.ReactNode;
}

export function Inspector({
  exchange: x,
  tz = "local",
  onPrev,
  onNext,
  onNextMatching,
  onFilterTrace,
  renderBodySplit,
  renderMsearch,
  renderStream,
  renderBody,
}: InspectorProps) {
  const [tab, setTab] = useState<BodyTab>("bodies");
  const [msView, setMsView] = useState<MsearchView>("paired");
  const reqCount = x.request.headers.length;
  const resCount = x.response?.headers.length ?? 0;

  return (
    <div className="flex min-w-0 flex-col bg-background">
      <ContextBar
        x={x}
        tz={tz}
        onPrev={onPrev}
        onNext={onNext}
        onNextMatching={onNextMatching}
        onFilterTrace={onFilterTrace}
      />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as BodyTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex items-center border-b px-gutter-x">
          <TabsList className="h-tab gap-0.5 bg-transparent p-0">
            <UnderlineTab value="bodies">
              {x.protocol === "sse" ? "Stream" : "Bodies"}
            </UnderlineTab>
            <UnderlineTab value="headers">Headers</UnderlineTab>
            <UnderlineTab value="timing">Timing</UnderlineTab>
          </TabsList>
          {/* Paired ↔ Raw NDJSON toggle — only for msearch, only on the Bodies tab */}
          {x.protocol === "msearch" && tab === "bodies" && (
            <ToggleGroup
              type="single"
              value={msView}
              onValueChange={(v) => v && setMsView(v as MsearchView)}
              size="sm"
              className="ml-auto"
            >
              <ToggleGroupItem value="paired">Paired</ToggleGroupItem>
              <ToggleGroupItem value="raw">Raw NDJSON</ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

        <TabsContent value="bodies" className="min-h-0 flex-1 overflow-hidden">
          {x.protocol === "msearch" && renderMsearch ? (
            renderMsearch(msView)
          ) : x.protocol === "sse" && renderStream ? (
            <StreamSplit
              x={x}
              renderBody={renderBody}
              renderStream={renderStream}
            />
          ) : (
            renderBodySplit()
          )}
        </TabsContent>

        <TabsContent value="headers" className="min-h-0 flex-1 overflow-auto">
          <div className="grid grid-cols-2 gap-px bg-border">
            <HeadersPane
              title="Request"
              count={reqCount}
              headers={x.request.headers}
            />
            <HeadersPane
              title="Response"
              count={resCount}
              headers={x.response?.headers ?? []}
            />
          </div>
        </TabsContent>

        <TabsContent value="timing" className="min-h-0 flex-1 overflow-auto">
          <TimingFacts x={x} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── context bar ── */
// PRO-341: `tz` stays in the prop contract (the caller threads it) but is not yet
// destructured/used — the clock rendering that consumes it is wired in PRO-345.
function ContextBar({
  x,
  onPrev,
  onNext,
  onNextMatching,
  onFilterTrace,
}: {
  x: Exchange;
  tz: "local" | "utc";
  onPrev?: () => void;
  onNext?: () => void;
  onNextMatching?: () => void;
  onFilterTrace?: (id: string) => void;
}) {
  const hasError = x.error != null;
  return (
    <div className="flex h-ctxbar items-center gap-2.5 border-b bg-card px-gutter-x">
      <div className="flex shrink-0 gap-0.5">
        <IconBtn onClick={onPrev} aria-label="Previous request">
          <ChevronUp className="size-4" />
        </IconBtn>
        <IconBtn onClick={onNext} aria-label="Next request">
          <ChevronDown className="size-4" />
        </IconBtn>
      </div>
      <MethodBadge method={x.method} size="md" />
      <PathDisplay uri={x.uri} onNextMatching={onNextMatching} />
      <StatusCode
        className="ml-auto shrink-0"
        status={x.status}
        hasError={hasError}
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
        <IconBtn
          onClick={onNextMatching}
          aria-label="Next request with same method + path"
        >
          <ChevronRight className="size-3.5" />
        </IconBtn>
      )}
    </span>
  );
}

function HeadersPane({
  title,
  count,
  headers,
}: {
  title: string;
  count: number;
  headers: Header[];
}) {
  return (
    <div className="bg-card">
      <div className="flex h-[30px] items-center gap-2 border-b px-3 text-xs text-muted-foreground">
        <span className="font-semibold text-secondary-foreground">{title}</span>
        <span className="font-mono">{count} headers</span>
      </div>
      <table className="w-full border-collapse font-mono text-sm">
        <tbody>
          {headers.map((h) => (
            <tr key={h.name} className="border-b">
              <td className="w-[30%] whitespace-nowrap px-3 py-1 align-top text-accent-foreground">
                {h.name}
              </td>
              <td className="px-3 py-1 align-top text-foreground [overflow-wrap:anywhere]">
                {h.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Facts only — standardized on "bytes". No synthetic upstream/proxy waterfall
// (the backend doesn't report a proxy breakdown — handoff).
function TimingFacts({ x }: { x: Exchange }) {
  const rows: [string, string][] = [
    ["HTTP version", "HTTP/1.1"],
    ["Method", x.method],
    [
      "Status",
      x.status != null
        ? String(x.status)
        : x.error
          ? `Error · ${x.error.kind}`
          : "pending",
    ],
    ["Elapsed", fmtMs(x.elapsedMs)],
    ["Request bytes", fmtBytes(x.request.wireBytes)],
    ["Response bytes", x.response ? fmtBytes(x.response.wireBytes) : "—"],
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

function StreamSplit({
  x,
  renderBody,
  renderStream,
}: {
  x: Exchange;
  renderBody: (t: string) => React.ReactNode;
  renderStream: () => React.ReactNode;
}) {
  return (
    <div className="grid h-full grid-cols-2 gap-px bg-border">
      <div className="overflow-auto bg-card">
        {x.request.body.phase === "complete"
          ? renderBody(x.request.body.text)
          : null}
      </div>
      {renderStream()}
    </div>
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

function IconBtn({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex size-[26px] items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  );
}
