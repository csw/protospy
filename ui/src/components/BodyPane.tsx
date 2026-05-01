import { useEffect, useState } from "react";
import type { BodyState } from "@ui/state/reducer";
import { decodeBody, type DecodeResult } from "@ui/body/decode";
import { formatSize } from "@ui/lib/utils";
import { CopyButton } from "./CopyButton";
import { EmptyState } from "./ui/EmptyState";
import { SectionHeader } from "./ui/SectionHeader";
import { JsonViewer } from "./JsonViewer";

interface Props {
  title: string;
  body: BodyState | undefined;
}

type DecodeEntry =
  | { status: "done"; body: BodyState; result: DecodeResult }
  | { status: "failed"; body: BodyState };

function useDecodeBody(body: BodyState | undefined): {
  loading: boolean;
  result: DecodeResult | null;
} {
  const [entry, setEntry] = useState<DecodeEntry | null>(null);

  useEffect(() => {
    if (body == null || !body.atEnd) {
      return;
    }
    let cancelled = false;
    decodeBody(body)
      .then((r) => {
        if (!cancelled) {
          setEntry({ status: "done", body, result: r });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntry({ status: "failed", body });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [body]);

  if (body == null) return { loading: false, result: null };
  if (!body.atEnd) return { loading: false, result: null };

  // body.atEnd is true — either we have a completed entry for this body, or we're loading
  if (entry != null && entry.body === body) {
    return {
      loading: false,
      result: entry.status === "done" ? entry.result : null,
    };
  }
  return { loading: true, result: null };
}

export function BodyPane({ title, body }: Props) {
  const { loading, result } = useDecodeBody(body);

  return (
    <div className="flex flex-col border border-border h-full overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-3 h-7 shrink-0 bg-bg2 border-b border-border">
        <SectionHeader>{title}</SectionHeader>
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

      {/* Body area */}
      <div className="flex-1 overflow-auto bg-pane-bg">
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
