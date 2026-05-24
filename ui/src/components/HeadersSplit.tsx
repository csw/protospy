import type { ProxyHeaders } from "@bindings/ProxyHeaders";
import { HeadersPane } from "./HeadersPane";

interface Props {
  reqHeaders: ProxyHeaders;
  resHeaders: ProxyHeaders;
}

function HeadersPanel({
  title,
  headers,
  emptyMessage,
  testId,
}: {
  title: string;
  headers: ProxyHeaders;
  emptyMessage: string;
  testId: string;
}) {
  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
      data-testid={testId}
    >
      <div className="flex items-center gap-3 px-3 h-[30px] shrink-0 bg-bg-sub border-b border-border">
        <span className="font-family-ui text-xs font-semibold text-ink-2">
          {title}
        </span>
        <span className="font-family-mono text-xs text-dim">
          {headers.length} {headers.length === 1 ? "header" : "headers"}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <HeadersPane headers={headers} emptyMessage={emptyMessage} />
      </div>
    </div>
  );
}

export function HeadersSplit({ reqHeaders, resHeaders }: Props) {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <HeadersPanel
        title="Request"
        headers={reqHeaders}
        emptyMessage="No request headers captured"
        testId="headers-panel-request"
      />
      <div className="w-px bg-border shrink-0" />
      <HeadersPanel
        title="Response"
        headers={resHeaders}
        emptyMessage="No response headers captured"
        testId="headers-panel-response"
      />
    </div>
  );
}
