// src/components/protospy/command-palette.tsx
// ⌘K palette — COMMANDS ONLY (no per-exchange search list; that's the filter
// bar's job). Open state is the store's `cmdKOpen`; every command writes a store
// action (or next-themes for theme), then closes. Labels are dynamic so each
// reads as a verb against the current state. "Jump to trace" is the one data-fed
// group: it enumerates the live traces and filters+selects on pick.

import { useMemo } from "react";
import { useTheme } from "next-themes";
import {
  Layers,
  Rows3,
  Table2,
  Clock,
  ArrowUpDown,
  Gauge,
  FilterX,
  Sun,
  Moon,
  Monitor,
  Search,
  Keyboard,
  Waypoints,
} from "lucide-react";
import { useStore } from "@ui/state/store";
import { traceColorVar, shortTraceId } from "@ui/lib/tokens";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@ui/components/ui/command";

export interface CommandPaletteProps {
  /** app-shell owns the filter input ref, so focusing it is a passed action. */
  onFocusFilter?: () => void;
}

export function CommandPalette({ onFocusFilter }: CommandPaletteProps) {
  const open = useStore((s) => s.cmdKOpen);
  const setOpen = useStore((s) => s.setCmdKOpen);

  const listMode = useStore((s) => s.listMode);
  const setListMode = useStore((s) => s.setListMode);
  const order = useStore((s) => s.order);
  const setOrder = useStore((s) => s.setOrder);
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  const timeZone = useStore((s) => s.timeZone);
  const setTimeZone = useStore((s) => s.setTimeZone);
  const traceGroupOn = useStore((s) => s.traceGroupOn);
  const toggleTraceGroup = useStore((s) => s.toggleTraceGroup);
  const filter = useStore((s) => s.filter);
  const traceFilter = useStore((s) => s.traceFilter);
  const setFilter = useStore((s) => s.setFilter);
  const setTraceFilter = useStore((s) => s.setTraceFilter);
  const setSelectedId = useStore((s) => s.setSelectedId);
  const setHelpOpen = useStore((s) => s.setHelpOpen);

  const exchanges = useStore((s) => s.exchanges);
  const ids = useStore((s) => s.ids);

  const { setTheme } = useTheme();
  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  const hasFilter = filter.trim() !== "" || traceFilter != null;

  // distinct traces present in the feed, with member counts + first member id
  const traces = useMemo(() => {
    const map = new Map<string, { count: number; firstId: number }>();
    for (const id of ids) {
      const t = exchanges.get(id)?.traceId;
      if (!t) continue;
      const cur = map.get(t);
      if (cur) cur.count++;
      else map.set(t, { count: 1, firstId: id });
    }
    return [...map.entries()].map(([traceId, v]) => ({ traceId, ...v }));
  }, [exchanges, ids]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Run a command…" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>

        <CommandGroup heading="View">
          <CommandItem onSelect={run(toggleTraceGroup)}>
            <Layers className="size-4" />
            {traceGroupOn ? "Flatten trace groups" : "Group by trace"}
            <CommandShortcut>⇧G</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={run(() =>
              setListMode(listMode === "table" ? "rows" : "table"),
            )}
          >
            {listMode === "table" ? (
              <Rows3 className="size-4" />
            ) : (
              <Table2 className="size-4" />
            )}
            {listMode === "table"
              ? "Switch to rows view"
              : "Switch to table view"}
          </CommandItem>
          <CommandItem
            onSelect={run(() =>
              setOrder(order === "newest" ? "oldest" : "newest"),
            )}
          >
            <ArrowUpDown className="size-4" />
            {order === "newest" ? "Order oldest first" : "Order newest first"}
          </CommandItem>
          <CommandItem
            onSelect={run(() =>
              setDensity(density === "compact" ? "regular" : "compact"),
            )}
          >
            <Gauge className="size-4" />
            {density === "compact" ? "Regular density" : "Compact density"}
          </CommandItem>
          <CommandItem
            onSelect={run(() =>
              setTimeZone(timeZone === "utc" ? "local" : "utc"),
            )}
          >
            <Clock className="size-4" />
            {timeZone === "utc"
              ? "Show local timestamps"
              : "Show UTC timestamps"}
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Filter">
          {onFocusFilter && (
            <CommandItem onSelect={run(onFocusFilter)}>
              <Search className="size-4" />
              Focus the filter
              <CommandShortcut>/</CommandShortcut>
            </CommandItem>
          )}
          {hasFilter && (
            <CommandItem
              onSelect={run(() => {
                setFilter("");
                setTraceFilter(null);
              })}
            >
              <FilterX className="size-4" />
              Clear filter
              <CommandShortcut>esc</CommandShortcut>
            </CommandItem>
          )}
        </CommandGroup>

        {traces.length > 0 && (
          <CommandGroup heading="Jump to trace">
            {traces.map((t) => (
              <CommandItem
                key={t.traceId}
                value={`trace ${t.traceId}`}
                onSelect={run(() => {
                  setTraceFilter(t.traceId);
                  setSelectedId(t.firstId);
                })}
              >
                <Waypoints className="size-4" />
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: traceColorVar(t.traceId) }}
                    aria-hidden
                  />
                  trace {shortTraceId(t.traceId)}
                </span>
                <CommandShortcut>{t.count}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Theme">
          <CommandItem onSelect={run(() => setTheme("light"))}>
            <Sun className="size-4" />
            Light
          </CommandItem>
          <CommandItem onSelect={run(() => setTheme("dark"))}>
            <Moon className="size-4" />
            Dark
          </CommandItem>
          <CommandItem onSelect={run(() => setTheme("system"))}>
            <Monitor className="size-4" />
            System
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Help">
          <CommandItem onSelect={run(() => setHelpOpen(true))}>
            <Keyboard className="size-4" />
            Keyboard shortcuts
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
