import { methodBadgeClass } from "@ui/lib/utils";

interface Props {
  method: string;
  size?: "sm" | "md";
}

export function MethodBadge({ method, size = "sm" }: Props) {
  const [textSize, padding] =
    size === "sm"
      ? (["text-xs", "px-1.5 py-0"] as const)
      : (["text-sm", "px-2 py-0.5"] as const);
  return (
    <span
      className={`font-family-ui ${textSize} font-black uppercase tracking-widest ${padding} shrink-0 ${methodBadgeClass(method)}`}
    >
      {method}
    </span>
  );
}
