import {
  Search,
  Layers,
  LayoutGrid,
  Sun,
  Moon,
  SunMoon,
  ChevronDown,
} from "lucide-react";
import { useStore } from "@ui/state/store";
import { cn } from "@ui/lib/utils";
import type { ThemePreference } from "@ui/theme/applyTheme";
import type { Service } from "@ui/api/info";
import type { ConnectionStatus } from "@ui/api/sse";
import { Button } from "./ui/button";
import { Toggle } from "./ui/toggle";
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

/**
 * Shared hover-surface override for the Button-based TopBar controls (service
 * picker, Jump-to, theme cycle). The shadcn `outline` and `ghost` variants
 * hover to `bg-accent`, which here resolves to protospy's bright blue accent —
 * only `--color-accent-foreground` is aliased in `@theme inline`, not
 * `--color-accent` — so we restore the subtle `bg-bg-hover` in both themes (the
 * JsonViewer className-override pattern).
 *
 * The `dark:` variant is NOT redundant: `bg-bg-hover` already tracks the
 * dark token via the CSS-variable cascade, but the `outline`/`ghost`
 * variants also ship their own `dark:hover:bg-*` (e.g. `dark:hover:bg-accent/50`)
 * which wins by specificity in dark mode. The matching `dark:` prefix lets
 * tailwind-merge dedupe it away — drop it and the dark hover reverts to the
 * blue accent (guarded by design-tokens.spec.ts).
 *
 * The `Toggle`-based controls (trace-group, density) do NOT need this: the
 * `Toggle` variant hovers to `bg-bg-hover` already and never touches
 * `bg-accent`, so there's no collision to override (see `iconToggleClass`).
 */
const hoverSurface = "hover:bg-bg-hover dark:hover:bg-bg-hover";

/**
 * Button-variant override for the theme cycle icon button, layered onto
 * `<Button variant="outline" size="icon-xs">`. Preserves the compact 26px
 * footprint of the 40px toolbar and neutralizes the `outline` variant's
 * resting shadow and dark fill (`shadow-xs`, `dark:bg-input/30`) so it reads
 * flat/transparent like the original hand-rolled button.
 */
const iconButtonClass = cn(
  "size-[26px] text-mid shadow-none dark:bg-transparent hover:text-ink",
  hoverSurface,
);

/**
 * Sizing, resting color, and pressed fill for the two icon `Toggle`s
 * (trace-group, density). Unlike the `Button` controls, the shared `Toggle`
 * variant is already flat/transparent with a subtle `bg-bg-hover` hover and no
 * `bg-accent` collision, so these carry no hover override — only the 26px
 * footprint that matches the toolbar and the resting `text-mid`.
 *
 * The pressed fill is driven off `aria-pressed`, NOT `data-[state=on]`: each
 * Toggle is wrapped in a `TooltipTrigger asChild`, whose own `data-state`
 * (open/closed) overwrites the Toggle's `data-state` on the merged element
 * (Radix spreads the trigger's props last), so `data-[state=on]:*` never
 * matches. Radix Toggle still manages `aria-pressed` reliably (the trigger
 * doesn't set it), so `aria-pressed:*` is the robust styling hook.
 *
 * We use the visible `accent-soft` tint rather than the variant's neutral
 * `bg-bg-pane` on-state because the toolbar is itself `bg-bg-pane` — a neutral
 * fill would be invisible, defeating the pressed indication (and density's
 * a11y gap this conversion is meant to close).
 */
const iconToggleClass =
  "size-[26px] text-mid aria-pressed:bg-accent-soft aria-pressed:text-accent";

/** Connection-status dot color for the service-picker trigger. */
function connectionDotClass(connection: ConnectionStatus): string {
  const base = "w-[7px] h-[7px] rounded-full shrink-0";
  if (connection === "open") return `${base} bg-green`;
  if (connection === "connecting") return `${base} bg-amber animate-pulse`;
  return `${base} bg-red animate-pulse`;
}

/** The three theme choices, cycled in this order. */
const THEME_CYCLE: ThemePreference[] = ["dark", "light", "system"];

/** Icon for the current theme preference. */
function ThemeIcon({ theme }: { theme: ThemePreference }) {
  switch (theme) {
    case "dark":
      return <Moon className="size-[15px]" />;
    case "light":
      return <Sun className="size-[15px]" />;
    case "system":
      return <SunMoon className="size-[15px]" />;
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
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const setCmdKOpen = useStore((s) => s.setCmdKOpen);

  function cycleTheme() {
    const idx = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  }

  return (
    <div className="flex items-center h-[40px] bg-bg-pane border-b border-border px-3 gap-2 shrink-0">
      {/* Logo */}
      <span className="font-family-ui font-semibold text-[14.5px] tracking-tight select-none">
        <span className="text-ink">proto</span>
        <span className="text-accent">spy</span>
      </span>

      {/* Service picker */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-[26px] gap-1.5 rounded px-2.5 font-family-mono text-[11.5px] text-ink-2 shadow-none dark:bg-transparent",
              hoverSurface,
            )}
          >
            <span className={connectionDotClass(connection)} />
            <span>{service ?? "—"}</span>
            <ChevronDown className="size-[11px] text-dim ml-0.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[200px]" align="start">
          {services.length === 0 ? (
            <DropdownMenuItem
              disabled
              className="text-dim font-family-mono text-xs"
            >
              No services configured
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

      {/* Jump to... button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setCmdKOpen(true)}
        className={cn(
          "h-[26px] gap-1.5 rounded border border-border bg-bg-sub px-2 text-dim hover:text-ink",
          hoverSurface,
        )}
      >
        <Search className="size-[13px]" />
        <span className="font-family-mono text-xs">Jump to…</span>
        <span className="inline-flex items-center px-1 h-4 rounded border border-border-strong font-family-mono text-[10px] text-dim bg-bg-sub">
          ⌘K
        </span>
      </Button>

      {/* Trace group toggle — binary on/off → Toggle (built-in aria-pressed +
          data-state; neutral data-[state=on] pressed fill from the variant). */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            pressed={traceGroupOn}
            onPressedChange={() => toggleTraceGroup()}
            className={iconToggleClass}
            aria-label="Group by trace"
          >
            <Layers className="size-[15px]" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>Group by trace</TooltipContent>
      </Tooltip>

      {/* Density toggle — binary regular/compact → Toggle. "compact" is the
          pressed state; the constant aria-label satisfies the APG rule. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            pressed={density === "compact"}
            onPressedChange={(pressed) =>
              setDensity(pressed ? "compact" : "regular")
            }
            className={iconToggleClass}
            aria-label="Toggle density"
          >
            <LayoutGrid className="size-[15px]" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>
          {density === "regular"
            ? "Switch to compact view"
            : "Switch to regular view"}
        </TooltipContent>
      </Tooltip>

      {/* Theme toggle (dark / light / system cycle) — 3 states, not a binary
          toggle, so it stays a Button (aria-pressed is binary per APG). */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-xs"
            onClick={cycleTheme}
            className={iconButtonClass}
            aria-label={themeTooltip(theme)}
          >
            <ThemeIcon theme={theme} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{themeTooltip(theme)}</TooltipContent>
      </Tooltip>
    </div>
  );
}
