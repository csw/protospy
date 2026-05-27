import type { Protocol } from "@bindings/Protocol";
import type { Exchange } from "@ui/state/reducer";
import { BodyPane } from "./BodyPane";
import { StreamView } from "./StreamView";
import { ChatStreamView } from "./anthropic/ChatStreamView";

interface Props {
  exchange: Exchange;
  protocol: Protocol | null;
}

function isSSE(exchange: Exchange): boolean {
  const ct = exchange.responseBody?.contentType?.toLowerCase() ?? "";
  return ct.startsWith("text/event-stream");
}

export function BodySplit({ exchange, protocol }: Props) {
  // Surface a proxy-level error inside the body pane that the error
  // direction applies to. "Request"-direction errors (connection refused,
  // upstream timeout before any response) belong on the request side
  // semantically — the request never made it. "Response"-direction
  // errors (mid-stream disconnect) belong on the response side.
  const requestError =
    exchange.error?.direction === "Request"
      ? { message: exchange.error.message }
      : undefined;
  const responseError =
    exchange.error?.direction === "Response"
      ? { message: exchange.error.message }
      : undefined;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <BodyPane
          title="Request"
          body={exchange.requestBody}
          cacheTo={{ exchangeId: exchange.id, direction: "request" }}
          error={requestError}
        />
      </div>
      <div className="w-px bg-border shrink-0" />
      <div className="flex-1 overflow-hidden">
        {isSSE(exchange) ? (
          protocol === "Anthropic" ? (
            <ChatStreamView exchange={exchange} />
          ) : (
            <StreamView exchange={exchange} />
          )
        ) : (
          <BodyPane
            title="Response"
            body={exchange.responseBody}
            cacheTo={{ exchangeId: exchange.id, direction: "response" }}
            error={responseError}
          />
        )}
      </div>
    </div>
  );
}
