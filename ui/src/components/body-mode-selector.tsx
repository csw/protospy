// Per-pane body view-mode selector (PRO-420). Renders the modes available for
// one body pane's content kind, per docs/ui/body-view-modes.md:
//
//   - Two-mode kinds where the only alternative to the default is hex (image,
//     text, JSON without a text view, binary) collapse to a single "Hex"
//     toggle — pressing it switches to hex, pressing again returns to default.
//   - Richer kinds render a segmented toggle group with every mode visible.
//
// Overflow collapsing (spec §"Overflow"): NOT implemented yet, by design. Every
// content kind in scope tops out at three short toggles (Tree·Text·Hex), and in
// the header strip the media-type slug is the only flex-shrinkable item — it
// truncates and absorbs all horizontal slack before the selector is ever
// crowded (the selector group is `shrink-0`). So there is nothing to overflow
// today. The real four-mode case is the Elasticsearch msearch `paired` mode,
// which is Inspector-level and out of PRO-420's scope. When it (or another
// 4+-mode kind) is wired in, add a "priority+" overflow here: wrap the toggles
// in a `min-w-0 overflow-hidden` cell, observe its width with a ResizeObserver,
// measure each toggle's (static) intrinsic width once, then greedily keep the
// highest-precedence modes that fit and push the rest into a dropdown menu
// (reserving room for the overflow trigger). That belongs with msearch, not as
// speculative machinery now.
import {
  MODE_LABELS,
  isHexToggleOnly,
  type ResolvedMode,
  type ViewMode,
} from "@ui/body/view-modes";
import { cn } from "@ui/lib/utils";
import { Toggle } from "@ui/components/ui/toggle";
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

  // Two-mode (or binary's lone-hex) case: a single Hex toggle is cleaner than a
  // two-item group. The implicit default (summary / rendered / tree / text)
  // owns the un-pressed state.
  if (isHexToggleOnly(modes)) {
    const pressed = current === "hex";
    return (
      <Toggle
        size="sm"
        pressed={pressed}
        onPressedChange={(next) => onSelect(next ? "hex" : null)}
        aria-label="Toggle hex view"
        className={cn("px-2 text-xs", className)}
      >
        {MODE_LABELS.hex}
      </Toggle>
    );
  }

  // Richer kinds: a segmented toggle group. `current` is always one of `modes`
  // here (summary only occurs for binary, which takes the toggle path above).
  return (
    <ToggleGroup
      type="single"
      value={current as ViewMode}
      onValueChange={(v) => v && onSelect(v as ViewMode)}
      size="sm"
      aria-label="Body view mode"
      className={className}
    >
      {modes.map((mode) => (
        <ToggleGroupItem key={mode} value={mode} className="px-2 text-xs">
          {MODE_LABELS[mode]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
