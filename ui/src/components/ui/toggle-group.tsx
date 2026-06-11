import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";

import { cn } from "@ui/lib/utils";
import { toggleVariants } from "@ui/components/ui/toggle";

const ToggleGroupContext = React.createContext<
  Pick<VariantProps<typeof toggleVariants>, "size">
>({
  size: "default",
});

function ToggleGroup({
  className,
  bordered = false,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    /** Show an outer border around the group */
    bordered?: boolean;
  }) {
  const ctxValue = React.useMemo(() => ({ size }), [size]);

  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-size={size}
      className={cn(
        "group/toggle-group flex w-fit items-center rounded-md bg-secondary",
        bordered && "border border-border overflow-hidden",
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={ctxValue}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  Pick<VariantProps<typeof toggleVariants>, "size">) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-size={context.size || size}
      className={cn(
        toggleVariants({
          variant: "segmented",
          size: context.size || size,
        }),
        "rounded-none border-0 focus:z-10 focus-visible:z-10",
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
