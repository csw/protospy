import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "radix-ui";

import { cn } from "@ui/lib/utils";

const toggleVariants = cva(
  "inline-flex items-center justify-center rounded text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Binary toolbar toggle / chip: soft primary active surface.
        // Standalone Toggle is tooltip-wrapped, so its on-state is keyed off
        // aria-pressed (which Radix Tooltip's data-state would clobber).
        // Computed-style guard in browser/design-tokens.spec.ts covers the
        // CSS evaluation that class-string tests can't prove.
        default:
          "bg-transparent text-muted-foreground hover:bg-hover hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary",
        // Segmented item (inside ToggleGroup): raised card fill on a secondary
        // recess, no accent. Keyed off data-[state=on] (stock shadcn default):
        // ToggleGroup items aren't tooltip-wrapped, and data-state is set for
        // both type="single" and type="multiple", sidestepping the
        // aria-checked-vs-aria-pressed split.
        segmented:
          "bg-transparent text-muted-foreground hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs dark:data-[state=on]:shadow-sm",
      },
      size: {
        default: "h-9 min-w-9 px-2",
        sm: "h-[27px] min-w-[27px] px-0",
        lg: "h-10 min-w-10 px-2.5",
        "icon-chrome": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-4",
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
