import type { ConnectionStatus } from "@ui/api/sse";
import { ConnectionIndicator } from "./ConnectionIndicator";

interface Props {
  connection: ConnectionStatus;
  service: string | null;
  exchangeCount: number;
}

export function StatusBar({ connection, service, exchangeCount }: Props) {
  return (
    <div className="flex items-center h-5 bg-ink px-2 gap-2 shrink-0 border-t border-border-strong">
      <ConnectionIndicator status={connection} />
      {service != null && (
        <span className="font-family-mono text-xs text-dim">{service}</span>
      )}
      <span className="font-family-ui text-xs text-dim uppercase tracking-widest">
        {exchangeCount} exchange{exchangeCount !== 1 ? "s" : ""}
      </span>
      <div className="flex-1" />
      <span className="font-family-ui text-xs text-dim uppercase tracking-[0.2em] select-none">
        protospy
      </span>
    </div>
  );
}
