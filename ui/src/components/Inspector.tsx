import type { Exchange } from "@ui/state/reducer";
import { EmptyState } from "./ui/EmptyState";
import { ContextBar } from "./ContextBar";
import { QueryParamsStrip } from "./QueryParamsStrip";
import { BodyPane } from "./BodyPane";
import { HeadersDrawer } from "./HeadersDrawer";

interface Props {
  exchange: Exchange | null;
}

export function Inspector({ exchange }: Props) {
  if (exchange == null) {
    return (
      <div className="flex-1 bg-pane-bg overflow-hidden">
        <EmptyState textSize="sm">Select an exchange</EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-pane-bg">
      {/* Context bar */}
      <ContextBar exchange={exchange} />

      {/* Query params strip */}
      {exchange.uri != null && <QueryParamsStrip uri={exchange.uri} />}

      {/* Body split — flex:1 */}
      <div className="flex flex-1 overflow-hidden gap-0.5 p-1 bg-bg2">
        <div className="flex-1 overflow-hidden">
          <BodyPane title="Request Body" body={exchange.requestBody} />
        </div>
        <div className="flex-1 overflow-hidden">
          <BodyPane title="Response Body" body={exchange.responseBody} />
        </div>
      </div>

      {/* Headers drawer */}
      <HeadersDrawer
        requestHeaders={exchange.requestHeaders}
        responseHeaders={exchange.responseHeaders}
      />
    </div>
  );
}
