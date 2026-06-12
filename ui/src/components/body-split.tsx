import type { Protocol } from "@bindings/Protocol";
import type { Exchange } from "@ui/state/reducer";
import { useStore } from "@ui/state/store";
import { Separator } from "./ui/separator";
import { BodyPane } from "./body-pane";
import { StreamView } from "./stream-view";
import { ChatStreamView } from "./anthropic/chat-stream-view";

interface Props {
  exchange: Exchange;
  protocol: Protocol | null;
}

function isSSE(exchange: Exchange): boolean {
  const ct = exchange.responseBody?.contentType?.toLowerCase() ?? "";
  return ct.startsWith("text/event-stream");
}

export function BodySplit({ exchange, protocol }: Props) {
  // Determine error message for the response pane. A Request-direction error
  // means "no response was ever produced"; a Response-direction error means
  // "response interrupted mid-stream". Either way, the response body pane
  // should surface the error instead of showing blank.
  const responseError = exchange.error?.message;

  // The response has not begun yet: no body, no status, no error. Distinct from a
  // body-less 200/204 (status arrived, no body) — drives "Awaiting response…" vs
  // "No body" in the response pane (PRO-360 deliverable B).
  const awaitingResponse =
    exchange.responseBody == null &&
    exchange.status == null &&
    exchange.error == null;

  // Shared body view mode (PRO-336). `paired` is an msearch-only layout handled
  // upstream in Inspector (it supersedes this split), so here it falls back to
  // the parsed per-pane rendering.
  const bodyViewMode = useStore((s) => s.bodyViewMode);
  const viewMode = bodyViewMode === "paired" ? "parsed" : bodyViewMode;

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <BodyPane
          title="Request"
          body={exchange.requestBody}
          cacheTo={{ exchangeId: exchange.id, direction: "request" }}
          viewMode={viewMode}
        />
      </div>
      <Separator
        orientation="vertical"
        className="bg-border-strong"
        data-testid="body-split-divider"
      />
      <div className="flex-1 overflow-hidden">
        {isSSE(exchange) ? (
          // Key on exchange.id so per-exchange view state — the stream's
          // play/pause snapshot, ChatStreamView's mode — resets when the
          // selected exchange changes (a paused snapshot must not leak onto a
          // different stream).
          protocol === "Anthropic" ? (
            <ChatStreamView key={exchange.id} exchange={exchange} />
          ) : (
            <StreamView key={exchange.id} exchange={exchange} />
          )
        ) : (
          <BodyPane
            title="Response"
            body={exchange.responseBody}
            errorMessage={responseError}
            awaiting={awaitingResponse}
            cacheTo={{ exchangeId: exchange.id, direction: "response" }}
            viewMode={viewMode}
          />
        )}
      </div>
    </div>
  );
}
