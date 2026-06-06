import { Search, X } from "lucide-react";

import { cn } from "@ui/lib/utils";
import { Button } from "./button";
import { Input } from "./input";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible label for the clear (X) button. */
  clearLabel?: string;
  /** Extra classes for the bordered wrapper (e.g. `flex-1`). */
  className?: string;
  "data-testid"?: string;
}

/**
 * The single search-box composite (FilterBar + HeadersPane): a Search icon, a
 * shadcn `Input` (chrome stripped so the wrapper owns border/focus), and a
 * `Button ghost` clear affordance shown only when there's a value.
 *
 * The bordered wrapper carries the visual chrome and `focus-within` focus
 * colour — the `Input` is transparent/borderless inside it — so the search box
 * reads as one control rather than a box-in-a-box.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  clearLabel = "Clear filter",
  className,
  "data-testid": dataTestid,
}: SearchInputProps) {
  return (
    <div
      data-testid={dataTestid}
      className={cn(
        "flex h-[24px] min-w-0 items-center gap-1.5 rounded border border-border bg-bg-sub px-2.5 focus-within:border-border-focus",
        className,
      )}
    >
      <Search size={11} className="shrink-0 text-dim" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // `md:text-xs` is load-bearing, not redundant: the Input base sets
        // `text-base md:text-sm`, so a flat `text-xs` alone leaves `md:text-sm`
        // (14px) winning at ≥md widths — every width this desktop app runs at.
        // Both classes are needed to hold the frozen 12px at all widths.
        className="h-auto flex-1 border-0 bg-transparent p-0 font-mono text-xs text-ink placeholder:text-dim focus-visible:ring-0 md:text-xs"
      />
      {value.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="icon-2xs"
          onClick={() => onChange("")}
          aria-label={clearLabel}
          className="shrink-0 text-dim"
        >
          <X />
        </Button>
      )}
    </div>
  );
}
