// src/components/protospy/list-toolbar.tsx
// The list-panel header strip: the "Requests" label + the three list controls,
// all bound to the store. Local/UTC only changes how the absolute timestamp is
// rendered (it's absolute either way). Order defaults to newest-first. Table is
// the default list mode.

import {
  Rows3,
  Table2,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
} from "lucide-react";
import { useStore } from "@ui/state/store";
import { Button } from "@ui/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@ui/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui/components/ui/tooltip";

export function ListToolbar() {
  const timeZone = useStore((s) => s.timeZone);
  const setTimeZone = useStore((s) => s.setTimeZone);
  const order = useStore((s) => s.order);
  const setOrder = useStore((s) => s.setOrder);
  const listMode = useStore((s) => s.listMode);
  const setListMode = useStore((s) => s.setListMode);

  return (
    <div
      data-testid="list-toolbar"
      className="grid h-strip shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b bg-card pl-gutter-x pr-2"
    >
      <span className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground">
        Requests
      </span>

      <div className="col-start-3 flex shrink-0 items-center gap-1.5 justify-self-end">
        <ToggleGroup
          type="single"
          size="sm"
          value={timeZone}
          onValueChange={(v) => v && setTimeZone(v as "local" | "utc")}
          aria-label="Timestamp timezone"
        >
          <ToggleGroupItem value="local" className="px-2 text-xs">
            Local
          </ToggleGroupItem>
          <ToggleGroupItem value="utc" className="px-2 text-xs">
            UTC
          </ToggleGroupItem>
        </ToggleGroup>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-chrome"
              onClick={() => setOrder(order === "newest" ? "oldest" : "newest")}
              aria-label={
                order === "newest"
                  ? "Newest first — click for oldest"
                  : "Oldest first — click for newest"
              }
              className="text-muted-foreground"
            >
              {order === "newest" ? (
                <ArrowDownWideNarrow />
              ) : (
                <ArrowUpWideNarrow />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {order === "newest" ? "Newest first" : "Oldest first"}
          </TooltipContent>
        </Tooltip>

        <ToggleGroup
          type="single"
          size="sm"
          value={listMode}
          onValueChange={(v) => v && setListMode(v as "rows" | "table")}
          aria-label="List view mode"
        >
          <ToggleGroupItem value="rows" aria-label="Rows view" className="px-2">
            <Rows3 className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="table"
            aria-label="Table view"
            className="px-2"
          >
            <Table2 className="size-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
