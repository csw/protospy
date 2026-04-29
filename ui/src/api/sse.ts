import type { EventMessage } from "@bindings/EventMessage";

export type ConnectionStatus = "connecting" | "open" | "reconnecting";

export function subscribeToEvents(
  serviceName: string,
  onMessage: (msg: EventMessage) => void,
  onStatusChange: (status: ConnectionStatus) => void,
): () => void {
  const url = `/service/${encodeURIComponent(serviceName)}/events`;
  const es = new EventSource(url);

  onStatusChange("connecting");

  es.onopen = () => {
    onStatusChange("open");
  };

  es.onerror = () => {
    onStatusChange("reconnecting");
  };

  es.addEventListener("exchange-report", (e: MessageEvent) => {
    try {
      const msg = JSON.parse((e as MessageEvent<string>).data) as EventMessage;
      onMessage(msg);
    } catch {
      // ignore parse failures
    }
  });

  return () => {
    es.close();
  };
}
