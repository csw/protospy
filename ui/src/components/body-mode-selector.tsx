// Per-pane body view-mode selector (PRO-420). Renders the modes available for
// one body pane's content kind as a segmented toggle group, per
// docs/ui/body-view-modes.md.
//
// All cases use a single `ToggleGroup type="single"` for visual consistency.
// Every content kind's default is itself a selectable segment — including
// binary, whose default `summary` (content-type + size + download) sits beside
// `Hex` as `Summary | Hex`. So the active mode is always a pressed segment and
// the group is never deselectable to an empty state. The group overrides
// ToggleGroup's default `bg-secondary` with a `bg-border` track so it reads as a
// recessed control against the `bg-secondary` header strip rather than blending
// into it.
//
// Overflow collapsing (spec §"Overflow"): NOT implemented yet, by design. Every
// content kind in scope tops out at three short toggles (Tree·Text·Hex), and in
// the header strip the media-type slug is the only flex-shrinkable item — it
// truncates and absorbs all horizontal slack before the selector is ever
// crowded. The real four-mode case is the Elasticsearch msearch `paired` mode,
// which is Inspector-level and out of PRO-420's scope. When it (or another
// 4+-mode kind) is wired in, add a "priority+" overflow here: wrap the toggles
// in a `min-w-0 overflow-hidden` cell, observe its width with a ResizeObserver,
// measure each toggle's (static) intrinsic width once, then greedily keep the
// highest-precedence modes that fit and push the rest into a dropdown menu.
import { MODE_LABELS, type ViewMode } from "@ui/body/view-modes";
import { cn } from "@ui/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@ui/components/ui/toggle-group";

interface Props {
  /** Selectable modes for this pane's content kind, in display order. */
  modes: ViewMode[];
  /** The currently resolved mode — always one of `modes`. */
  current: ViewMode;
  /** Select a mode. */
  onSelect: (mode: ViewMode) => void;
  className?: string;
}

export function BodyModeSelector({
  modes,
  current,
  onSelect,
  className,
}: Props) {
  if (modes.length === 0) return null;

  return (
    <ToggleGroup
      type="single"
      value={current}
      // Single-select with no deselect: ignore the empty value Radix emits when
      // the active item is re-clicked, so a mode is always selected.
      onValueChange={(v) => v && onSelect(v as ViewMode)}
      size="sm"
      aria-label="Body view mode"
      className={cn("bg-border", className)}
    >
      {modes.map((mode) => (
        <ToggleGroupItem
          key={mode}
          value={mode}
          // Shorter than the default sm height so the `bg-border` track clears
          // the strip with visible margin top and bottom — without it the group
          // nearly fills the strip and the recess reads as flush. `h-toggle-item`
          // tracks `--strip-h` across densities (see globals.css).
          className="h-toggle-item min-w-0 px-2 text-xs"
        >
          {MODE_LABELS[mode]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
