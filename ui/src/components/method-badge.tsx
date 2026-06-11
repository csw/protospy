// src/components/protospy/method-badge.tsx
// Exemplar of the project's custom-component pattern: cva variants over semantic
// tokens, composed with cn(). Never hard-codes a color.
//
// Consumes the live string `method` (PRO-359): the runtime model carries
// `method?: string`, so an unknown or absent method falls back to neutral tokens
// and renders "?" rather than assuming the 7-method enum.

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@ui/lib/utils";

const methodBadge = cva(
  "inline-flex items-center justify-center rounded-[3px] font-mono font-semibold uppercase tracking-wide tabular-nums leading-tight shrink-0",
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

const KNOWN_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
type KnownMethod = (typeof KNOWN_METHODS)[number];

function knownMethod(method: string): KnownMethod | undefined {
  const upper = method.toUpperCase();
  return (KNOWN_METHODS as readonly string[]).includes(upper)
    ? (upper as KnownMethod)
    : undefined;
}

export interface MethodBadgeProps extends Omit<
  VariantProps<typeof methodBadge>,
  "method"
> {
  method: string | undefined;
  className?: string;
}

export function MethodBadge({ method, size, className }: MethodBadgeProps) {
  const known = method != null ? knownMethod(method) : undefined;
  return (
    <span
      data-testid="method-badge"
      className={cn(
        methodBadge({ method: known, size }),
        // Unknown/absent method (e.g. CONNECT, or no request line yet): neutral
        // tokens instead of an un-themed transparent badge.
        known == null && "text-muted-foreground bg-secondary",
        className,
      )}
    >
      {method ?? "?"}
    </span>
  );
}
