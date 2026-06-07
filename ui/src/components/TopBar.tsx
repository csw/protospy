import {
  Search,
  Layers,
  LayoutGrid,
  Sun,
  Moon,
  SunMoon,
  ChevronDown,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useStore } from "@ui/state/store";
import { cn } from "@ui/lib/utils";
import type { ThemePreference } from "@ui/theme/theme";
import type { Service } from "@ui/api/info";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";

interface Props {
  services: Service[];
  onSwitchService: (name: string) => void;
}

const iconBtnClass =
  "w-[26px] h-[26px] flex items-center justify-center rounded-md border border-border text-mid hover:text-ink hover:bg-bg-hover transition-colors cursor-pointer";

/** The three theme choices, cycled in this order. */
const THEME_CYCLE: ThemePreference[] = ["dark", "light", "system"];

/** Icon for the current theme preference. */
function ThemeIcon({ theme }: { theme: ThemePreference }) {
  switch (theme) {
    case "dark":
      return <Moon size={15} />;
    case "light":
      return <Sun size={15} />;
    case "system":
      return <SunMoon size={15} />;
  }
}

/** Tooltip label for the current theme, showing what the next click does. */
function themeTooltip(theme: ThemePreference): string {
  const idx = THEME_CYCLE.indexOf(theme);
  const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
  return `Theme: ${theme} (click for ${next})`;
}

export function TopBar({ services, onSwitchService }: Props) {
  const service = useStore((s) => s.service);
  const connection = useStore((s) => s.connection);
  const traceGroupOn = useStore((s) => s.traceGroupOn);
  const toggleTraceGroup = useStore((s) => s.toggleTraceGroup);
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  // Theme is owned by next-themes (the `.dark` class on <html>), not the store.
  // `theme` is `string | undefined`; coerce to our three-state preference.
  const { theme, setTheme } = useTheme();
  const themePref = (theme as ThemePreference | undefined) ?? "system";
  const setCmdKOpen = useStore((s) => s.setCmdKOpen);

  function connectionDotClass(): string {
    if (connection === "open")
      return "w-[7px] h-[7px] rounded-full bg-green shrink-0";
    if (connection === "connecting")
      return "w-[7px] h-[7px] rounded-full bg-amber shrink-0 animate-pulse";
    return "w-[7px] h-[7px] rounded-full bg-red shrink-0 animate-pulse";
  }

  function cycleTheme() {
    const idx = THEME_CYCLE.indexOf(themePref);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  }

  return (
    <div className="flex items-center h-[40px] bg-bg-pane border-b border-border px-3 gap-2 shrink-0">
      {/* Logo */}
      <span className="font-ui font-semibold text-[14.5px] tracking-tight select-none">
        <span className="text-ink">proto</span>
        <span className="text-accent">spy</span>
      </span>

      {/* Service picker */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 px-2.5 h-[26px] rounded border border-border font-mono text-[11.5px] text-ink-2 hover:bg-bg-hover cursor-pointer transition-colors">
            <span className={connectionDotClass()} />
            <span>{service ?? "—"}</span>
            <ChevronDown size={11} className="text-dim ml-0.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[200px]" align="start">
          {services.length === 0 ? (
            <DropdownMenuItem disabled className="text-dim font-mono text-xs">
              No services configured
            </DropdownMenuItem>
          ) : (
            services.map((svc) => (
              <DropdownMenuItem
                key={svc.name}
                onClick={() => onSwitchService(svc.name)}
                className="flex flex-col items-start gap-0.5 font-mono text-xs cursor-pointer"
              >
                <span className="font-medium text-ink">{svc.name}</span>
                <span className="text-dim text-[10px]">→ {svc.target}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Jump to... button */}
      <button
        onClick={() => setCmdKOpen(true)}
        className="flex items-center gap-1.5 h-[26px] px-2 rounded border border-border bg-bg-sub text-dim hover:text-ink hover:bg-bg-hover transition-colors cursor-pointer"
      >
        <Search size={13} />
        <span className="font-mono text-xs">Jump to…</span>
        <span className="inline-flex items-center px-1 h-4 rounded border border-border-strong font-mono text-[10px] text-dim bg-bg-sub">
          ⌘K
        </span>
      </button>

      {/* Trace group toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={toggleTraceGroup}
            className={cn(
              iconBtnClass,
              traceGroupOn && "bg-accent-soft text-accent border-accent/30",
            )}
            aria-label="Group by trace"
            aria-pressed={traceGroupOn}
          >
            <Layers size={15} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Group by trace</TooltipContent>
      </Tooltip>

      {/* Density toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() =>
              setDensity(density === "regular" ? "compact" : "regular")
            }
            className={iconBtnClass}
            aria-label="Toggle density"
          >
            <LayoutGrid size={15} />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {density === "regular"
            ? "Switch to compact view"
            : "Switch to regular view"}
        </TooltipContent>
      </Tooltip>

      {/* Theme toggle (dark / light / system cycle) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={cycleTheme}
            className={iconBtnClass}
            aria-label={themeTooltip(themePref)}
          >
            <ThemeIcon theme={themePref} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{themeTooltip(themePref)}</TooltipContent>
      </Tooltip>
    </div>
  );
}
