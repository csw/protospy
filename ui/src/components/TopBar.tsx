import {
  Search,
  Layers,
  LayoutGrid,
  Sun,
  Moon,
  ChevronDown,
} from "lucide-react";
import { useStore } from "@ui/state/store";
import type { Service } from "@ui/api/info";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./ui/tooltip";

interface Props {
  services: Service[];
  onSwitchService: (name: string) => void;
}

const iconBtnClass =
  "w-[26px] h-[26px] flex items-center justify-center rounded-md border border-border text-mid hover:text-ink hover:bg-bg-hover transition-colors cursor-pointer";

export function TopBar({ services, onSwitchService }: Props) {
  const service = useStore((s) => s.service);
  const connection = useStore((s) => s.connection);
  const traceGroupOn = useStore((s) => s.traceGroupOn);
  const toggleTraceGroup = useStore((s) => s.toggleTraceGroup);
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  const darkMode = useStore((s) => s.darkMode);
  const toggleDarkMode = useStore((s) => s.toggleDarkMode);
  const setCmdKOpen = useStore((s) => s.setCmdKOpen);

  function connectionDotClass(): string {
    if (connection === "open")
      return "w-[7px] h-[7px] rounded-full bg-green shrink-0";
    if (connection === "connecting")
      return "w-[7px] h-[7px] rounded-full bg-amber shrink-0 animate-pulse";
    return "w-[7px] h-[7px] rounded-full bg-red shrink-0 animate-pulse";
  }

  return (
    <TooltipProvider>
      <div className="flex items-center h-[40px] bg-bg-pane border-b border-border px-3 gap-2 shrink-0">
        {/* Logo */}
        <span
          className="font-family-ui font-semibold text-[14.5px] tracking-tight select-none"
          style={{ fontFamily: "Inter Variable, Inter, sans-serif" }}
        >
          <span className="text-ink">proto</span>
          <span className="text-accent">spy</span>
        </span>

        {/* Service picker */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 px-2.5 h-[26px] rounded border border-border font-family-mono text-[11.5px] text-ink-2 hover:bg-bg-hover cursor-pointer transition-colors">
              <span className={connectionDotClass()} />
              <span>{service ?? "—"}</span>
              <ChevronDown size={11} className="text-dim ml-0.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="bg-bg-pane border-border text-ink min-w-[200px]"
            align="start"
          >
            {services.length === 0 ? (
              <DropdownMenuItem
                disabled
                className="text-dim font-family-mono text-xs"
              >
                No services
              </DropdownMenuItem>
            ) : (
              services.map((svc) => (
                <DropdownMenuItem
                  key={svc.name}
                  onClick={() => onSwitchService(svc.name)}
                  className="flex flex-col items-start gap-0.5 font-family-mono text-xs cursor-pointer"
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

        {/* Jump to… button */}
        <button
          onClick={() => setCmdKOpen(true)}
          className="flex items-center gap-1.5 h-[26px] px-2 rounded border border-border bg-bg-sub text-dim hover:text-ink hover:bg-bg-hover transition-colors cursor-pointer"
        >
          <Search size={13} />
          <span className="font-family-mono text-xs">Jump to…</span>
          <span className="inline-flex items-center px-1 h-4 rounded border border-border-strong font-family-mono text-[10px] text-dim bg-bg-sub">
            ⌘K
          </span>
        </button>

        {/* Trace group toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleTraceGroup}
              className={`${iconBtnClass} ${traceGroupOn ? "bg-accent-soft text-accent border-accent/30" : ""}`}
              aria-label="Group by trace"
              aria-pressed={traceGroupOn}
            >
              <Layers size={15} />
            </button>
          </TooltipTrigger>
          <TooltipContent className="bg-bg-pane border-border text-ink text-xs">
            Group by trace
          </TooltipContent>
        </Tooltip>

        {/* Density toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() =>
                setDensity(density === "regular" ? "compact" : "regular")
              }
              className={iconBtnClass}
              aria-label={`Density: ${density}`}
            >
              <LayoutGrid size={15} />
            </button>
          </TooltipTrigger>
          <TooltipContent className="bg-bg-pane border-border text-ink text-xs">
            Density: {density}
          </TooltipContent>
        </Tooltip>

        {/* Dark mode toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleDarkMode}
              className={iconBtnClass}
              aria-label={
                darkMode ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              {darkMode ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </TooltipTrigger>
          <TooltipContent className="bg-bg-pane border-border text-ink text-xs">
            {darkMode ? "Light mode" : "Dark mode"}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
