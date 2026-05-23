import { methodBadgeClass } from "@ui/lib/utils";

interface Props {
  method: string;
  size?: "sm" | "md";
}

export function MethodBadge({ method, size = "sm" }: Props) {
  const [textSize, padding, minWidth] =
    size === "sm"
      ? (["text-ui-xs", "px-[6px] py-[2px]", "min-w-[44px]"] as const)
      : (["text-[12px]", "px-2 py-[3px]", "min-w-[56px]"] as const);
  return (
    <span
      data-testid="method-badge"
      className={`font-family-mono ${textSize} font-semibold tracking-[0.04em] rounded-[3px] ${padding} ${minWidth} inline-flex items-center justify-center shrink-0 ${methodBadgeClass(method)}`}
    >
      {method}
    </span>
  );
}
