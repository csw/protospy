import { ThemeToggle } from "./ThemeToggle";

interface Props {
  service: string | null;
}

export function TopBar({ service }: Props) {
  return (
    <div className="flex items-center h-[38px] bg-ink border-b-2 border-red px-3 gap-3 shrink-0">
      {/* Logo */}
      <span className="font-family-ui font-black text-lg tracking-tight select-none">
        <span className="text-bg">proto</span>
        <span className="text-red">spy</span>
      </span>

      {/* Service target */}
      {service != null && (
        <span className="font-family-mono text-xs text-dim flex items-center gap-1">
          <span className="text-mid">→</span>
          <span>{service}</span>
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <ThemeToggle />
    </div>
  );
}
