import { AlertTriangle } from "lucide-react";
import type { BodyState } from "@ui/state/reducer";
import { useDecodeBody } from "@ui/hooks/useDecodeBody";
import { formatSize } from "@ui/lib/utils";
import { CopyButton } from "./CopyButton";
import { StreamErrorBanner } from "./StreamErrorBanner";
import { SimpleTooltip } from "./ui/SimpleTooltip";
import { EmptyState } from "./ui/EmptyState";
import { JsonViewer } from "./JsonViewer";

/** Centered error display used for both "no response" and "response interrupted" states. */
function ErrorPanel({
  title: panelTitle,
  message,
  detail,
}: {
  title: string;
  message: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 h-full px-6 text-center">
      <AlertTriangle size={20} className="text-red/60" />
      <span className="font-ui text-sm font-medium text-red">{panelTitle}</span>
      <span className="font-mono text-xs text-mid max-w-md leading-relaxed">
        {message}
      </span>
      {detail != null && (
        <span className="font-mono text-xs text-dim">{detail}</span>
      )}
    </div>
  );
}

interface Props {
  title: string;
  body: BodyState | undefined;
  /**
   * Proxy-level error message to display in the body area. When set, the
   * pane shows the error message prominently instead of the normal "No body"
   * empty state. Used by BodySplit to surface `exchange.error.message`.
   */
  errorMessage?: string;
  /**
   * If provided, the decoded byte count from the decode pipeline is cached
   * back onto `BodyState.decodedBytes` so other surfaces (timing view,
   * exchange list) can show a dual wire/decoded size without re-running
   * decode themselves.
   */
  cacheTo?: { exchangeId: number; direction: "request" | "response" };
}

export function BodyPane({ title, body, errorMessage, cacheTo }: Props) {
  const { loading, result } = useDecodeBody(body, cacheTo);

  return (
    <div className="flex flex-col border border-border h-full overflow-hidden">
      {/* Pane head (30px) */}
      <div className="flex items-center gap-3 px-3 h-[30px] shrink-0 bg-bg-sub border-b border-border">
        <span className="font-ui text-xs font-semibold text-ink-2">
          {title}
        </span>
        {result != null && (
          <span className="font-mono text-xs text-dim">{result.mediaType}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {result != null && (
            <SimpleTooltip
              content={
                result.decodedBytes != null
                  ? `${formatSize(result.wireBytes)} on the wire / ${formatSize(result.decodedBytes)} after decompression`
                  : undefined
              }
            >
              <span
                className="font-mono text-xs text-dim"
                data-testid="body-size"
              >
                {result.decodedBytes != null
                  ? `${formatSize(result.wireBytes)} / ${formatSize(result.decodedBytes)}`
                  : formatSize(result.wireBytes)}
              </span>
            </SimpleTooltip>
          )}
          {body != null && <CopyButton text={result?.text} />}
        </div>
      </div>

      {/* Body area. `min-h-0` lets the flex item shrink below its content
          height — without it, large bodies (e.g. JsonViewer's virtualized
          spacer) push the container to their full size and break scroll
          virtualization downstream. */}
      <div className="flex-1 min-h-0 overflow-auto bg-bg-pane">
        {loading && <EmptyState>Decoding…</EmptyState>}

        {!loading && body != null && !body.atEnd && errorMessage == null && (
          <EmptyState>
            Streaming… ({formatSize(body.wireBytes)} received)
          </EmptyState>
        )}

        {!loading && body != null && !body.atEnd && errorMessage != null && (
          <ErrorPanel
            title="Response interrupted"
            message={errorMessage}
            detail={`${formatSize(body.wireBytes)} received before error`}
          />
        )}

        {!loading && body == null && errorMessage != null && (
          <ErrorPanel title="Error" message={errorMessage} />
        )}

        {!loading && body == null && errorMessage == null && (
          <EmptyState>No body</EmptyState>
        )}

        {!loading && body != null && body.atEnd && result == null && (
          <EmptyState>Could not decode body</EmptyState>
        )}

        {!loading &&
          result != null &&
          (result.kind === "json" || result.kind === "jsonl") &&
          result.text != null && (
            <JsonViewer
              text={result.text}
              kind={result.kind}
              parsed={result.parsed}
            />
          )}

        {!loading &&
          result != null &&
          result.kind === "text" &&
          result.text != null && (
            <pre className="font-mono text-xs text-ink p-3 whitespace-pre-wrap">
              {result.text}
            </pre>
          )}

        {!loading && result != null && result.kind === "binary" && (
          <EmptyState>Binary data · {formatSize(result.wireBytes)}</EmptyState>
        )}

        {/* Mid-stream error: body completed but the exchange has an error.
            Only shown when atEnd is true — the !atEnd case is handled above
            with the "Response interrupted" centered display. */}
        {!loading && body != null && body.atEnd && errorMessage != null && (
          <StreamErrorBanner message={errorMessage} />
        )}
      </div>
    </div>
  );
}
