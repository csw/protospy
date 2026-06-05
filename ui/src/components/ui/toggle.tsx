import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "radix-ui";

import { cn } from "@ui/lib/utils";

const toggleVariants = cva(
  "inline-flex items-center justify-center rounded text-ui-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Binary toolbar toggle / chip — accent-soft active surface.
        // Standalone Toggle is tooltip-wrapped, so its on-state is keyed off
        // aria-pressed (which Radix Tooltip's data-state would clobber).
        default:
          "bg-transparent text-mid hover:bg-bg-hover hover:text-ink aria-pressed:bg-accent-soft aria-pressed:text-accent-ink",
        // Segmented item (inside ToggleGroup) — raised bg-pane fill on a bg-sub
        // recess, no accent. Keyed off data-[state=on] (stock shadcn default):
        // ToggleGroup items aren't tooltip-wrapped, and data-state is set for
        // both type="single" and type="multiple", sidestepping the
        // aria-checked-vs-aria-pressed split. Shadow is theme-aware — the 5%
        // light shadow is invisible on a dark raised pane, so a dark override
        // carries the elevation cue there.
        segmented:
          "bg-transparent text-mid hover:text-ink data-[state=on]:bg-bg-pane data-[state=on]:text-ink data-[state=on]:shadow-[0_1px_1px_rgba(0,0,0,.05)] dark:data-[state=on]:shadow-[0_1px_2px_rgba(0,0,0,.35)]",
      },
      size: {
        default: "h-9 min-w-9 px-2",
        sm: "h-[22px] min-w-[22px] px-0",
        lg: "h-10 min-w-10 px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
