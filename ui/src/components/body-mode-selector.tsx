// Per-pane body view-mode selector (PRO-420). Renders the modes available for
// one body pane's content kind as a segmented toggle group, per
// docs/ui/body-view-modes.md.
//
// All cases use a single `ToggleGroup type="single"` for visual consistency —
// including the two-mode kinds (image, text, JSON-without-text) and binary,
// whose lone selectable mode is `hex` (summary is the implicit default, so the
// group renders a single deselectable "Hex" item: pressing it shows hex,
// pressing again returns to the summary default). The group sits on a `bg-input`
// track so it reads as a control against the `bg-secondary` header strip rather
// than blending into it.
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
import {
  MODE_LABELS,
  type ResolvedMode,
  type ViewMode,
} from "@ui/body/view-modes";
import { cn } from "@ui/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@ui/components/ui/toggle-group";

interface Props {
  /** Selectable modes for this pane's content kind, in display order. */
  modes: ViewMode[];
  /** The currently resolved mode (may be `summary` for binary bodies). */
  current: ResolvedMode;
  /** Select a mode; `null` returns to the content kind's default. */
  onSelect: (mode: ViewMode | null) => void;
  className?: string;
}

export function BodyModeSelector({
  modes,
  current,
  onSelect,
  className,
}: Props) {
  if (modes.length === 0) return null;

  // The pressed item is the current mode when it is one of the selectable modes;
  // for binary's implicit `summary` default `current` is not selectable, so no
  // item is pressed (the lone Hex toggle reads as off).
  const value = modes.includes(current as ViewMode)
    ? (current as ViewMode)
    : "";

  return (
    <ToggleGroup
      type="single"
      value={value}
      // Deselecting (clicking the active item) yields "" → null → default.
      onValueChange={(v) => onSelect((v as ViewMode) || null)}
      size="sm"
      aria-label="Body view mode"
      className={cn("bg-input", className)}
    >
      {modes.map((mode) => (
        <ToggleGroupItem
          key={mode}
          value={mode}
          // Shorter than the default sm height so the `bg-input` track clears
          // the 32px strip with visible margin top and bottom — without it the
          // group nearly fills the strip and the recess reads as flush.
          className="h-[18px] min-w-0 px-2 text-xs"
        >
          {MODE_LABELS[mode]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
