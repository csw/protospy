import type { ConnectionStatus } from "@ui/api/sse";

interface Props {
  status: ConnectionStatus;
}

export function ConnectionIndicator({ status }: Props) {
  if (status === "connecting") {
    return (
      <span
        className="inline-block w-2 h-2 rounded-full bg-amber animate-pulse"
        title="Connecting"
      />
    );
  }
  if (status === "open") {
    return (
      <span
        className="inline-block w-2 h-2 rounded-full bg-green"
        title="Connected"
      />
    );
  }
  // reconnecting
  return (
    <span
      className="inline-block w-2 h-2 rounded-full bg-red animate-pulse"
      title="Reconnecting"
    />
  );
}
