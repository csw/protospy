import { cn } from "@ui/lib/utils";

interface Props {
  children: React.ReactNode;
  textSize?: "xs" | "sm";
}

export function EmptyState({ children, textSize = "xs" }: Props) {
  return (
    <div className="flex items-center justify-center h-full">
      <span
        className={cn(
          "text-dim font-ui uppercase tracking-widest",
          textSize === "xs" ? "text-xs" : "text-sm",
        )}
      >
        {children}
      </span>
    </div>
  );
}
