import type { BodyState } from "@ui/state/reducer";
import { useDecodeBody } from "@ui/hooks/useDecodeBody";
import { formatSize } from "@ui/lib/utils";
import { CopyButton } from "./CopyButton";
import { EmptyState } from "./ui/EmptyState";
import { JsonViewer } from "./JsonViewer";

interface Props {
  title: string;
  body: BodyState | undefined;
}

export function BodyPane({ title, body }: Props) {
  const { loading, result } = useDecodeBody(body);

  return (
    <div className="flex flex-col border border-border h-full overflow-hidden">
      {/* Pane head (30px) */}
      <div className="flex items-center gap-3 px-3 h-[30px] shrink-0 bg-bg-sub border-b border-border">
        <span className="font-family-ui text-xs font-semibold text-ink-2">
          {title}
        </span>
        {result != null && (
          <span className="font-family-mono text-xs text-dim">
            {result.mediaType}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {result != null && (
            <span className="font-family-mono text-xs text-dim">
              {formatSize(result.size)}
            </span>
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

        {!loading && body != null && !body.atEnd && (
          <EmptyState>
            Streaming… ({formatSize(body.totalBytes)} received)
          </EmptyState>
        )}

        {!loading && body == null && <EmptyState>No body</EmptyState>}

        {!loading && body != null && body.atEnd && result == null && (
          <EmptyState>Decode failed</EmptyState>
        )}

        {!loading &&
          result != null &&
          (result.kind === "json" || result.kind === "jsonl") &&
          result.text != null && <JsonViewer text={result.text} />}

        {!loading &&
          result != null &&
          result.kind === "text" &&
          result.text != null && (
            <pre className="font-family-mono text-xs text-ink p-3 whitespace-pre-wrap">
              {result.text}
            </pre>
          )}

        {!loading && result != null && result.kind === "binary" && (
          <EmptyState>Binary data · {formatSize(result.size)}</EmptyState>
        )}
      </div>
    </div>
  );
}
