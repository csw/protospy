import type { Exchange } from "@ui/state/reducer";
import { BodyPane } from "./BodyPane";
import { StreamView } from "./StreamView";

interface Props {
  exchange: Exchange;
}

function isSSE(exchange: Exchange): boolean {
  const ct = exchange.responseBody?.contentType?.toLowerCase() ?? "";
  return ct.startsWith("text/event-stream");
}

export function BodySplit({ exchange }: Props) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <BodyPane title="Request" body={exchange.requestBody} />
      </div>
      <div className="w-px bg-border shrink-0" />
      <div className="flex-1 overflow-hidden">
        {isSSE(exchange) ? (
          <StreamView exchange={exchange} />
        ) : (
          <BodyPane title="Response" body={exchange.responseBody} />
        )}
      </div>
    </div>
  );
}
