// src/components/protospy/method-badge.tsx
// Exemplar of the project's custom-component pattern: cva variants over semantic
// tokens, composed with cn(). Never hard-codes a color.

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { HttpMethod } from "@/lib/types";

const methodBadge = cva(
  "inline-flex items-center justify-center rounded-[3px] font-mono font-semibold uppercase tracking-wide tabular-nums leading-tight",
  {
    variants: {
      method: {
        GET: "text-method-get bg-method-get-bg",
        POST: "text-method-post bg-method-post-bg",
        PUT: "text-method-put bg-method-put-bg",
        PATCH: "text-method-patch bg-method-patch-bg",
        DELETE: "text-method-delete bg-method-delete-bg",
        HEAD: "text-method-head bg-method-head-bg",
        OPTIONS: "text-method-options bg-method-options-bg",
      },
      size: {
        sm: "min-w-[44px] px-1.5 py-0.5 text-[10.5px]",
        md: "min-w-[56px] px-2 py-[3px] text-xs",
      },
    },
    defaultVariants: { size: "sm" },
  },
);

export interface MethodBadgeProps extends VariantProps<typeof methodBadge> {
  method: HttpMethod;
  className?: string;
}

export function MethodBadge({ method, size, className }: MethodBadgeProps) {
  return (
    <span className={cn(methodBadge({ method, size }), className)}>
      {method}
    </span>
  );
}
