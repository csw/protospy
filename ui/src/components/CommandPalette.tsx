import { useStore } from "@ui/state/store";
import type { ThemePreference } from "@ui/theme/applyTheme";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "./ui/command";
import {
  Sun,
  Moon,
  SunMoon,
  LayoutGrid,
  Rows3,
  TableProperties,
  Layers,
  Globe,
  X,
} from "lucide-react";

const cmdItemClass =
  "h-[36px] px-2 rounded-md hover:bg-bg-hover data-[selected=true]:bg-bg-active cursor-pointer";

/** Theme options shown in the command palette. */
const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light mode", icon: Sun },
  { value: "dark", label: "Dark mode", icon: Moon },
  { value: "system", label: "System theme", icon: SunMoon },
];

export function CommandPalette() {
  const cmdKOpen = useStore((s) => s.cmdKOpen);
  const setCmdKOpen = useStore((s) => s.setCmdKOpen);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  const listMode = useStore((s) => s.listMode);
  const setListMode = useStore((s) => s.setListMode);
  const toggleTraceGroup = useStore((s) => s.toggleTraceGroup);
  const timeZone = useStore((s) => s.timeZone);
  const setTimeZone = useStore((s) => s.setTimeZone);
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);

  function close() {
    setCmdKOpen(false);
  }

  function handleSetTheme(value: ThemePreference) {
    setTheme(value);
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

  function handleToggleTimeZone() {
    setTimeZone(timeZone === "local" ? "utc" : "local");
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
      className="top-[12vh] translate-y-0 max-w-[600px] rounded-[10px] shadow-lg"
    >
      <CommandInput
        placeholder="Search commands…"
        className="font-family-mono text-sm text-ink placeholder:text-dim"
      />
      <CommandList className="max-h-[480px]">
        <CommandEmpty className="py-6 text-center font-family-ui text-sm text-dim">
          No results found.
        </CommandEmpty>

        {/* Theme section */}
        <CommandGroup
          heading="Theme"
          className="[&_[cmdk-group-heading]]:font-family-ui [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-mid [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
        >
          {THEME_OPTIONS.map((opt) => (
            <CommandItem
              key={opt.value}
              value={`theme ${opt.value} mode ${opt.label}`}
              onSelect={() => handleSetTheme(opt.value)}
              className={cmdItemClass}
            >
              <opt.icon className="size-4 text-mid" />
              <span className="font-family-ui text-sm text-ink">
                {opt.label}
              </span>
              {theme === opt.value && (
                <span className="ml-auto text-xs text-accent">active</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Commands section */}
        <CommandGroup
          heading="Commands"
          className="[&_[cmdk-group-heading]]:font-family-ui [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-mid [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
        >
          <CommandItem
            value="toggle density compact regular"
            onSelect={handleToggleDensity}
            className={cmdItemClass}
          >
            <LayoutGrid className="size-4 text-mid" />
            <span className="font-family-ui text-sm text-ink">
              Toggle density
            </span>
          </CommandItem>

          <CommandItem
            value="switch list view table rows mode"
            onSelect={handleSwitchListMode}
            className={cmdItemClass}
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
            className={cmdItemClass}
          >
            <Layers className="size-4 text-mid" />
            <span className="font-family-ui text-sm text-ink">
              Toggle trace grouping
            </span>
          </CommandItem>

          <CommandItem
            value="toggle time zone utc local timestamps"
            onSelect={handleToggleTimeZone}
            className={cmdItemClass}
          >
            <Globe className="size-4 text-mid" />
            <span className="font-family-ui text-sm text-ink">
              {timeZone === "local"
                ? "Switch to UTC timestamps"
                : "Switch to local timestamps"}
            </span>
          </CommandItem>

          {filter && (
            <CommandItem
              value="clear filter reset search"
              onSelect={handleClearFilter}
              className={cmdItemClass}
            >
              <X className="size-4 text-mid" />
              <span className="font-family-ui text-sm text-ink">
                Clear filter
              </span>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
