import { AlertTriangle } from "lucide-react";
import type { BodyState } from "@ui/state/reducer";
import { useDecodeBody } from "@ui/hooks/useDecodeBody";
import { formatSize } from "@ui/lib/utils";
import { mediaTypeSlug } from "@ui/lib/format";
import { CopyButton } from "./copy-button";
import { StreamErrorBanner } from "./stream-error-banner";
import { SimpleTooltip } from "./ui/SimpleTooltip";
import { EmptyState } from "./ui/EmptyState";
import { JsonViewer } from "./json-viewer";

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
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 h-full px-6 text-center"
    >
      <AlertTriangle size={20} className="text-error/60" />
      <span className="font-sans text-sm font-medium text-error">
        {panelTitle}
      </span>
      <span className="font-mono text-xs text-muted-foreground max-w-md leading-relaxed">
        {message}
      </span>
      {detail != null && (
        <span className="font-mono text-xs text-muted-foreground">
          {detail}
        </span>
      )}
    </div>
  );
}

/**
 * A non-content body state — awaiting / streaming / no-body / undecodable. Wrapped
 * in a `role="status"` region (implicitly `aria-live="polite"`) so the lifecycle
 * transition is ANNOUNCED to assistive tech, not conveyed by color alone
 * (design-system hard rule 5; PRO-360 deliverable B). The distinct copy per state
 * is the non-color signal.
 */
function LifecycleState({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="h-full">
      <EmptyState>{children}</EmptyState>
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
   * True when this side has no body *because the response has not begun yet*
   * (status null, no error, no body) — distinct from a genuinely body-less
   * response (GET / 204). Drives the "Awaiting response…" vs "No body" copy so
   * the two lifecycle states render distinctly (design-system hard rule 5;
   * PRO-360 deliverable B). The request side never sets this (a request always
   * exists).
   */
  awaiting?: boolean;
  /**
   * If provided, the decoded byte count from the decode pipeline is cached
   * back onto `BodyState.decodedBytes` so other surfaces (timing view,
   * exchange list) can show a dual wire/decoded size without re-running
   * decode themselves.
   */
  cacheTo?: { exchangeId: number; direction: "request" | "response" };
}

export function BodyPane({
  title,
  body,
  errorMessage,
  awaiting,
  cacheTo,
}: Props) {
  // `useDecodeBody` IS the O1 model-side memoized decoded-entity accessor (PRO-354):
  // it gates decode on `body.atEnd` (lifecycle.phase === "ended") and returns a
  // decoded view only then, keyed on body identity. A separate `useDecodedEntity`
  // wrapper would be Option C (a view-side shim) — cut per the shim-vs-seam bar.
  const { loading, result } = useDecodeBody(body, cacheTo);
  const mediaTypeDisplay =
    result != null ? mediaTypeSlug(result.mediaType) : null;

  return (
    <div className="flex flex-col border border-border h-full overflow-hidden">
      <div className="flex h-tab shrink-0 items-center gap-3 border-b border-border bg-secondary px-3">
        <span className="shrink-0 font-sans text-xs font-semibold text-secondary-foreground">
          {title}
        </span>
        {mediaTypeDisplay != null && (
          <SimpleTooltip
            content={
              mediaTypeDisplay !== result?.mediaType
                ? result?.mediaType
                : undefined
            }
          >
            <span
              className="min-w-0 truncate font-mono text-xs text-muted-foreground"
              data-testid="body-media-type"
            >
              {mediaTypeDisplay}
            </span>
          </SimpleTooltip>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {result != null && (
            <SimpleTooltip
              content={
                result.decodedBytes != null
                  ? `${formatSize(result.wireBytes)} on the wire / ${formatSize(result.decodedBytes)} after decompression`
                  : undefined
              }
            >
              <span
                className="font-mono text-xs text-muted-foreground"
                data-testid="body-size"
              >
                {result.decodedBytes != null
                  ? `${formatSize(result.wireBytes)} / ${formatSize(result.decodedBytes)}`
                  : formatSize(result.wireBytes)}
              </span>
            </SimpleTooltip>
          )}
          {body != null && <CopyButton value={result?.text} />}
        </div>
      </div>

      {/* Body area. `min-h-0` lets the flex item shrink below its content
          height — without it, large bodies (e.g. JsonViewer's virtualized
          spacer) push the container to their full size and break scroll
          virtualization downstream. */}
      <div className="flex-1 min-h-0 overflow-auto bg-card">
        {loading && <LifecycleState>Decoding…</LifecycleState>}

        {!loading && body != null && !body.atEnd && errorMessage == null && (
          <LifecycleState>
            Streaming… ({formatSize(body.wireBytes)} received)
          </LifecycleState>
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

        {/* No body yet: distinguish "the response hasn't begun" (awaiting) from a
            genuinely body-less response (GET / 204) — not a flat "pending". */}
        {!loading && body == null && errorMessage == null && (
          <LifecycleState>
            {awaiting ? "Awaiting response…" : "No body"}
          </LifecycleState>
        )}

        {!loading && body != null && body.atEnd && result == null && (
          <LifecycleState>Could not decode body</LifecycleState>
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
            <pre className="font-mono text-xs text-foreground p-3 whitespace-pre-wrap">
              {result.text}
            </pre>
          )}

        {!loading && result != null && result.kind === "binary" && (
          <LifecycleState>
            Binary data · {formatSize(result.wireBytes)}
          </LifecycleState>
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
