import { useStore } from "@ui/state/store";
import type { ConnectionStatus } from "@ui/api/sse";

function connectionDot(status: ConnectionStatus) {
  if (status === "open") {
    return <span className="w-[7px] h-[7px] rounded-full bg-green shrink-0" />;
  }
  if (status === "connecting") {
    return (
      <span className="w-[7px] h-[7px] rounded-full bg-amber shrink-0 animate-pulse" />
    );
  }
  return (
    <span className="w-[7px] h-[7px] rounded-full bg-red shrink-0 animate-pulse" />
  );
}

function connectionText(status: ConnectionStatus): string {
  if (status === "open") return "connected";
  if (status === "connecting") return "connecting";
  return "reconnecting";
}

export function StatusBar() {
  const connection = useStore((s) => s.connection);
  const service = useStore((s) => s.service);
  const ids = useStore((s) => s.ids);

  return (
    <div className="flex items-center h-[24px] bg-bg-sub border-t border-border px-2 gap-2 shrink-0">
      {/* Connection dot + text */}
      {connectionDot(connection)}
      <span className="font-family-mono text-xs text-dim">
        {connectionText(connection)}
      </span>

      {/* Service target */}
      {service != null && (
        <span className="font-family-mono text-xs text-dim">→ {service}</span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Exchange count */}
      <span className="font-family-mono text-xs text-dim">
        {ids.length} request{ids.length !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
