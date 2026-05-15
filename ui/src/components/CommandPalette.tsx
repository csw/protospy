import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/reducer";
import {
  formatTime,
  splitUri,
  statusTextClass,
  traceColor,
} from "@ui/lib/utils";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "./ui/command";
import { MethodBadge } from "./ui/MethodBadge";
import {
  Sun,
  Moon,
  LayoutGrid,
  Rows3,
  TableProperties,
  Layers,
  X,
} from "lucide-react";

const MAX_EXCHANGES = 50;

export function CommandPalette() {
  const cmdKOpen = useStore((s) => s.cmdKOpen);
  const setCmdKOpen = useStore((s) => s.setCmdKOpen);
  const darkMode = useStore((s) => s.darkMode);
  const toggleDarkMode = useStore((s) => s.toggleDarkMode);
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  const listMode = useStore((s) => s.listMode);
  const setListMode = useStore((s) => s.setListMode);
  const toggleTraceGroup = useStore((s) => s.toggleTraceGroup);
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const setSelectedId = useStore((s) => s.setSelectedId);
  const exchanges = useStore((s) => s.exchanges);
  const ids = useStore((s) => s.ids);

  // Derive all exchanges, most-recent-first, limited to MAX_EXCHANGES
  const allExchanges: Exchange[] = ids
    .map((id) => exchanges.get(id))
    .filter((ex): ex is Exchange => ex != null)
    .slice(-MAX_EXCHANGES)
    .reverse();

  function close() {
    setCmdKOpen(false);
  }

  function handleSelectExchange(ex: Exchange) {
    setSelectedId(ex.id);
    close();
  }

  function handleToggleDarkMode() {
    toggleDarkMode();
    close();
  }

  function handleToggleDensity() {
    setDensity(density === "regular" ? "compact" : "regular");
    close();
  }

  function handleSwitchListMode() {
    setListMode(listMode === "rows" ? "table" : "rows");
    close();
  }

  function handleToggleTraceGroup() {
    toggleTraceGroup();
    close();
  }

  function handleClearFilter() {
    setFilter("");
    close();
  }

  return (
    <CommandDialog
      open={cmdKOpen}
      onOpenChange={setCmdKOpen}
      showCloseButton={false}
      className="top-[12vh] translate-y-0 max-w-[600px] bg-bg-pane border border-border rounded-[10px] shadow-lg"
    >
      <CommandInput
        placeholder="Search..."
        className="font-family-mono text-sm text-ink placeholder:text-dim"
      />
      <CommandList className="max-h-[480px]">
        <CommandEmpty className="py-6 text-center font-family-ui text-sm text-dim">
          No results found.
        </CommandEmpty>

        {/* Commands section */}
        <CommandGroup
          heading="Commands"
          className="[&_[cmdk-group-heading]]:font-family-ui [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-mid [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
        >
          <CommandItem
            value="toggle dark mode light dark theme"
            onSelect={handleToggleDarkMode}
            className="h-[36px] px-2 rounded-md hover:bg-bg-hover data-[selected=true]:bg-bg-active cursor-pointer"
          >
            {darkMode ? (
              <Sun className="size-4 text-mid" />
            ) : (
              <Moon className="size-4 text-mid" />
            )}
            <span className="font-family-ui text-sm text-ink">
              Toggle dark mode
            </span>
          </CommandItem>

          <CommandItem
            value="toggle density compact regular"
            onSelect={handleToggleDensity}
            className="h-[36px] px-2 rounded-md hover:bg-bg-hover data-[selected=true]:bg-bg-active cursor-pointer"
          >
            <LayoutGrid className="size-4 text-mid" />
            <span className="font-family-ui text-sm text-ink">
              Toggle density
            </span>
          </CommandItem>

          <CommandItem
            value="switch list view table rows mode"
            onSelect={handleSwitchListMode}
            className="h-[36px] px-2 rounded-md hover:bg-bg-hover data-[selected=true]:bg-bg-active cursor-pointer"
          >
            {listMode === "rows" ? (
              <TableProperties className="size-4 text-mid" />
            ) : (
              <Rows3 className="size-4 text-mid" />
            )}
            <span className="font-family-ui text-sm text-ink">
              {listMode === "rows"
                ? "Switch to table view"
                : "Switch to rows view"}
            </span>
          </CommandItem>

          <CommandItem
            value="toggle trace grouping tracing"
            onSelect={handleToggleTraceGroup}
            className="h-[36px] px-2 rounded-md hover:bg-bg-hover data-[selected=true]:bg-bg-active cursor-pointer"
          >
            <Layers className="size-4 text-mid" />
            <span className="font-family-ui text-sm text-ink">
              Toggle trace grouping
            </span>
          </CommandItem>

          {filter && (
            <CommandItem
              value="clear filter reset search"
              onSelect={handleClearFilter}
              className="h-[36px] px-2 rounded-md hover:bg-bg-hover data-[selected=true]:bg-bg-active cursor-pointer"
            >
              <X className="size-4 text-mid" />
              <span className="font-family-ui text-sm text-ink">
                Clear filter
              </span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        {/* Exchanges section */}
        <CommandGroup
          heading={`Exchanges · ${ids.length}`}
          className="[&_[cmdk-group-heading]]:font-family-ui [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-mid [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
        >
          {allExchanges.map((ex) => {
            const method = ex.method ?? "?";
            const uri = ex.uri ?? "/";
            const { path } = splitUri(uri);
            const itemValue = `${method} ${ex.status ?? ""} ${uri} ${ex.id}`;

            return (
              <CommandItem
                key={ex.id}
                value={itemValue}
                onSelect={() => handleSelectExchange(ex)}
                className="h-[36px] px-2 rounded-md hover:bg-bg-hover data-[selected=true]:bg-bg-active cursor-pointer gap-2"
              >
                <MethodBadge method={method} size="sm" />
                {ex.status != null && (
                  <span
                    className={`font-family-mono text-xs ${statusTextClass(ex.status)} shrink-0`}
                  >
                    {ex.status}
                  </span>
                )}
                <span className="font-family-mono text-xs text-ink flex-1 truncate min-w-0">
                  {path}
                </span>
                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  {ex.traceId && (
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: traceColor(ex.traceId) }}
                    />
                  )}
                  <span className="font-family-mono text-xs text-dim">
                    {formatTime(ex.timestamp)}
                  </span>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
