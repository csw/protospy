// src/components/protospy/top-bar.tsx
// App chrome row 1. Reads/writes the store directly (no prop drilling): the
// service picker, group-by-trace, density and ⌘K opener all bind to store
// fields/actions. THEME is the one exception — it lives in next-themes
// (.dark on <html>), so the theme control uses useTheme(), not the store.
//
// Layout: wordmark · service picker · Jump-to ⌘K (grows, max-w-xl) · group · density · theme.

import { useTheme } from "next-themes";
import {
  Search,
  Layers,
  Sun,
  Moon,
  Monitor,
  Rows3,
  Rows2,
  ChevronDown,
  Check,
} from "lucide-react";
import { useStore } from "@ui/state/store";
import type { ConnectionStatus } from "@ui/lib/types";
import { ConnectionDot, connDotStatus } from "./connection-dot";
import { Button } from "@ui/components/ui/button";
import { Toggle } from "@ui/components/ui/toggle";
import { Separator } from "@ui/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@ui/components/ui/dropdown-menu";

/** Service metadata is app/config-owned (loaded async) — not in the store, which
 *  only holds the selected `service` name. Pass the configured list in. */
export interface ServiceInfo {
  name: string;
  upstream: string;
  addr: string;
  connection: ConnectionStatus;
}

export interface TopBarProps {
  services?: ServiceInfo[];
  onSwitchService?: (name: string) => void;
}

export function TopBar({ services = [], onSwitchService }: TopBarProps) {
  const service = useStore((s) => s.service);
  const connection = connDotStatus(useStore((s) => s.connection));
  const setService = useStore((s) => s.setService);
  const traceGroupOn = useStore((s) => s.traceGroupOn);
  const toggleTraceGroup = useStore((s) => s.toggleTraceGroup);
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  const setCmdKOpen = useStore((s) => s.setCmdKOpen);

  return (
    <header className="flex h-topbar shrink-0 items-center gap-3 border-b bg-card px-gutter-x">
      <span className="shrink-0 select-none text-[14px] font-bold tracking-tight">
        proto<span className="text-primary">spy</span>
      </span>

      {/* Service picker — single-select (multi-service is deferred; §7) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-sm text-secondary-foreground hover:border-border-strong"
          >
            <ConnectionDot status={connection} />
            <span className="font-mono">{service ?? "no service"}</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {services.map((svc) => (
            <DropdownMenuItem
              key={svc.name}
              onSelect={() => (onSwitchService ?? setService)(svc.name)}
              className="gap-2.5"
            >
              <ConnectionDot status={svc.connection} />
              <span className="flex min-w-0 flex-col">
                <span className="font-mono text-sm">{svc.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {svc.upstream} -&gt; {svc.addr}
                </span>
              </span>
              {svc.name === service && (
                <Check className="ml-auto size-3.5 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
          {services.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
            {services.length} {services.length === 1 ? "service" : "services"}{" "}
            configured
          </DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ⌘K opener — grows to fill empty space at wide viewports, capped at max-w-xl */}
      <Button
        variant="outline"
        size="sm-dense"
        onClick={() => setCmdKOpen(true)}
        className="min-w-fit max-w-xl grow justify-between text-muted-foreground"
      >
        <span className="flex items-center gap-1.5">
          <Search className="size-3.5" />
          Jump to…
        </span>
        <kbd className="rounded border border-b-2 bg-secondary px-1.5 py-px font-mono text-xs text-muted-foreground">
          ⌘K
        </kbd>
      </Button>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {/* Group-by-trace */}
        <IconToggle
          active={traceGroupOn}
          onClick={toggleTraceGroup}
          label={
            traceGroupOn
              ? "Grouping by trace — click to flatten"
              : "Group by trace"
          }
        >
          <Layers />
        </IconToggle>

        {/* Density (regular ↔ compact) */}
        <IconToggle
          active={density === "compact"}
          onClick={() =>
            setDensity(density === "compact" ? "regular" : "compact")
          }
          label={
            density === "compact"
              ? "Compact density — click for regular"
              : "Regular density — click for compact"
          }
        >
          {density === "compact" ? <Rows2 /> : <Rows3 />}
        </IconToggle>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <ThemeControl />
      </div>
    </header>
  );
}

/* Theme is next-themes, NOT the store. Three-state cycle: light → dark → system. */
function ThemeControl() {
  const { theme, setTheme } = useTheme();
  const next: Record<string, string> = {
    light: "dark",
    dark: "system",
    system: "light",
  };
  const current = theme ?? "system";
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;
  const label = `Theme: ${current} — click to cycle`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-chrome"
          onClick={() => setTheme(next[current] ?? "light")}
          aria-label={label}
          className="shrink-0 text-muted-foreground"
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function IconToggle({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          pressed={active}
          onPressedChange={() => onClick?.()}
          aria-label={label}
          size="icon-chrome"
          className="shrink-0 text-muted-foreground"
        >
          {children}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
