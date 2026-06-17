import type { Protocol } from "@bindings/Protocol";
import type { ProxyHeaders } from "@bindings/ProxyHeaders";
import type { Exchange } from "@ui/state/reducer";
import { useStore } from "@ui/state/store";
import { deriveFilename } from "@ui/lib/download";
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

function getHeader(
  headers: ProxyHeaders | undefined,
  name: string,
): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name)?.value;
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

  // Per-direction body view-mode state (PRO-420). Request and response are
  // independent: a JSON request and an image response have different available
  // modes and selections.
  const requestViewMode = useStore((s) => s.requestViewMode);
  const responseViewMode = useStore((s) => s.responseViewMode);
  const setRequestViewMode = useStore((s) => s.setRequestViewMode);
  const setResponseViewMode = useStore((s) => s.setResponseViewMode);

  // Download filenames: Content-Disposition wins, then the request path's
  // basename, with a content-type extension appended when needed.
  const requestFilename = deriveFilename({
    contentDisposition: getHeader(
      exchange.requestHeaders,
      "content-disposition",
    ),
    uri: exchange.uri,
    contentType: exchange.requestBody?.contentType,
  });
  const responseFilename = deriveFilename({
    contentDisposition: getHeader(
      exchange.responseHeaders,
      "content-disposition",
    ),
    uri: exchange.uri,
    contentType: exchange.responseBody?.contentType,
  });

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <BodyPane
          title="Request"
          body={exchange.requestBody}
          cacheTo={{ exchangeId: exchange.id, direction: "request" }}
          viewMode={requestViewMode}
          onViewModeChange={setRequestViewMode}
          downloadFilename={requestFilename}
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
            viewMode={responseViewMode}
            onViewModeChange={setResponseViewMode}
            downloadFilename={responseFilename}
          />
        )}
      </div>
    </div>
  );
}
