// src/components/protospy/msearch-view.tsx
// Request/response element correlation (Elasticsearch _msearch/_mget). Numbered
// sub-cards aligned 1:1 across two columns. Responses are collapsed by default
// (shadcn Collapsible) showing a summary; click to expand. Clicking a card head
// focuses the pair on both sides. `Paired` is one option in the inspector tab
// strip's body view-mode selector (see inspector.tsx); the other options
// (parsed/raw/hex) render the normal request/response split instead.
//
// This is the chrome + correlation logic; the per-sub-body rendering delegates to
// the live JSON viewer (passed in as the `requestBody`/`responseBody` slots).
// Summary stats are ES-specific and computed by app code.
//
// PRO-362 (Slice 5): import-unified (@/ → @ui/) and brought under vitest coverage.
// The component is intentionally not yet mounted — the in-Bodies Paired view renders
// a placeholder; wiring app-computed `SubExchange[]` pairing into it is PRO-56.

// PRO-341: dropped unused `useState` import from the v2.3 scaffold (the
// Collapsible primitives manage their own open state) to satisfy noUnusedLocals.
import { ChevronRight } from "lucide-react";
import { cn } from "@ui/lib/utils";
import { statusClass, type StatusKind } from "@ui/lib/tokens";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@ui/components/ui/collapsible";

export interface SubExchange {
  index: string; // target index name
  description: string; // human query summary (first line)
  status: number;
  hits: number;
  tookMs: number;
  showing?: number;
  requestBody: React.ReactNode; // <JsonTreeViewer …/>
  responseBody: React.ReactNode; // <JsonTreeViewer …/>
}

const STAT_TEXT: Record<StatusKind, string> = {
  ok: "text-ok",
  redirect: "text-redirect",
  client: "text-client",
  server: "text-server",
  pending: "text-pending",
  error: "text-error",
};

function IndexBadge({ n, focused }: { n: number; focused: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md border font-mono text-xs font-semibold",
        focused
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card text-secondary-foreground",
      )}
    >
      {n}
    </span>
  );
}

function Stats({ sub }: { sub: SubExchange }) {
  return (
    <span className="ml-auto inline-flex shrink-0 items-center gap-2.5 font-mono text-xs whitespace-nowrap">
      <span className={cn("font-semibold", STAT_TEXT[statusClass(sub.status)])}>
        {sub.status}
      </span>
      <span className={sub.hits === 0 ? "text-redirect" : "text-ok"}>
        {sub.hits} hits{sub.showing ? ` (showing ${sub.showing})` : ""}
      </span>
      <span className="text-muted-foreground">{sub.tookMs} ms</span>
    </span>
  );
}

export function MsearchView({
  subs,
  focusedIndex,
  onFocus,
}: {
  subs: SubExchange[];
  focusedIndex: number | null;
  onFocus: (i: number | null) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 gap-px bg-border">
      {/* request column */}
      <div className="overflow-auto bg-card">
        <PaneHead
          title="Sub-requests"
          meta={`${subs.length} × _msearch · ndjson`}
        />
        {subs.map((sub, i) => (
          <div
            key={i}
            className={cn(
              "m-2 overflow-hidden rounded-md border bg-card",
              focusedIndex === i && "border-primary ring-1 ring-primary",
            )}
          >
            <button
              type="button"
              onClick={() => onFocus(focusedIndex === i ? null : i)}
              className="flex w-full items-center gap-2.5 border-b bg-secondary px-2.5 py-2 text-left"
            >
              <IndexBadge n={i + 1} focused={focusedIndex === i} />
              <span className="flex min-w-0 flex-col font-mono">
                <span className="truncate text-xs text-muted-foreground">
                  {sub.index}
                </span>
                <span className="truncate text-sm text-secondary-foreground">
                  {sub.description}
                </span>
              </span>
              <Stats sub={sub} />
            </button>
            <div className="px-3 py-2">{sub.requestBody}</div>
          </div>
        ))}
      </div>

      {/* response column — collapsed by default */}
      <div className="overflow-auto bg-card">
        <PaneHead title="Sub-responses" meta={`${subs.length} responses`} />
        {subs.map((sub, i) => (
          <Collapsible
            key={i}
            defaultOpen={i === 0}
            className={cn(
              "m-2 overflow-hidden rounded-md border bg-card",
              focusedIndex === i && "border-primary ring-1 ring-primary",
            )}
          >
            <CollapsibleTrigger className="group flex w-full items-center gap-2.5 border-b bg-secondary px-2.5 py-2 text-left">
              <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
              <IndexBadge n={i + 1} focused={focusedIndex === i} />
              <Stats sub={sub} />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 py-2">
              {sub.responseBody}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}

function PaneHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex h-strip items-center gap-2 border-b px-3 text-xs text-muted-foreground">
      <span className="font-semibold text-secondary-foreground">{title}</span>
      <span className="font-mono">{meta}</span>
    </div>
  );
}
