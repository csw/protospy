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
  // Determine error message for the response pane. A Request-direction error
  // means "no response was ever produced"; a Response-direction error means
  // "response interrupted mid-stream". Either way, the response body pane
  // should surface the error instead of showing blank.
  const responseError = exchange.error?.message;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <BodyPane
          title="Request"
          body={exchange.requestBody}
          cacheTo={{ exchangeId: exchange.id, direction: "request" }}
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
            errorMessage={responseError}
            cacheTo={{ exchangeId: exchange.id, direction: "response" }}
          />
        )}
      </div>
    </div>
  );
}
