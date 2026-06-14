import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { BodyState } from "@ui/state/reducer";
import type { ContentMode } from "@ui/state/store";
import { useDecodeBody } from "@ui/hooks/useDecodeBody";
import type { DecodeResult } from "@ui/body/decode";
import { formatSize } from "@ui/lib/utils";
import { mediaTypeSlug } from "@ui/lib/format";
import { hexDumpText } from "@ui/lib/hex";
import { CopyButton } from "./copy-button";
import { StreamErrorBanner } from "./stream-error-banner";
import { SimpleTooltip } from "./ui/simple-tooltip";
import { EmptyState } from "./ui/empty-state";
import { Skeleton } from "./ui/skeleton";
import { JsonFlatView } from "./json-viewer";
import { JsonTreeViewer } from "./json-tree";
import { RawView } from "./raw-view";
import { HexView } from "./hex-view";

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
      <span className="font-mono text-xs text-muted-foreground min-w-0 max-w-md leading-relaxed wrap-anywhere">
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

/**
 * Skeleton shown while the body is being decoded / parsed. Renders pulsing
 * lines that suggest tree-structured content, giving the user a visual cue
 * that content is on its way rather than a blank pane. Announced to assistive
 * tech via `role="status"`.
 */
function BodySkeleton() {
  return (
    <div
      role="status"
      data-testid="body-skeleton"
      className="flex flex-col gap-1.5 p-3"
    >
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}

/**
 * The decoded body rendered per the active view mode. `parsed` keeps the
 * kind-switched smart rendering; `raw` and `hex` are kind-agnostic escape
 * hatches over the same decoded bytes (PRO-336).
 */
function BodyContent({
  result,
  viewMode,
}: {
  result: DecodeResult;
  viewMode: ContentMode;
}) {
  if (viewMode === "hex") return <HexView bytes={result.bytes} />;
  if (viewMode === "raw") return <RawView text={result.rawText} />;

  // parsed — the kind-switched rendering.
  if (result.kind === "json" && result.parsed != null) {
    // Wrap so the JSON viewer gets the same top inset as raw/hex/text views.
    // h-full resolves against the wrapper's content box, keeping the viewer
    // below the padding without overflow.
    return (
      <div className="h-full pt-3 pl-3">
        <JsonTreeViewer
          value={result.parsed}
          initialRows={result.initialRows}
          initialExpanded={result.initialExpanded}
          aria-label="JSON viewer"
        />
      </div>
    );
  }
  if (result.kind === "jsonl" && result.text != null) {
    return (
      <div className="h-full pt-3 pl-3">
        <JsonFlatView text={result.text} />
      </div>
    );
  }
  if (result.kind === "text" && result.text != null) {
    return (
      <pre className="font-mono text-xs text-foreground p-3 whitespace-pre-wrap">
        {result.text}
      </pre>
    );
  }
  if (result.kind === "binary") {
    return (
      <LifecycleState>
        Binary data · {formatSize(result.wireBytes)}
      </LifecycleState>
    );
  }
  return null;
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
  /**
   * The shared body view mode (PRO-336). `parsed` keeps the kind-switched smart
   * rendering; `raw` shows the decoded text; `hex` shows a hex + ASCII dump.
   * Passed in (not read from the store) so this pane stays presentational.
   * Defaults to `"parsed"` so tests that only care about size/error state can
   * omit it.
   */
  viewMode?: ContentMode;
}

export function BodyPane({
  title,
  body,
  errorMessage,
  awaiting,
  cacheTo,
  viewMode = "parsed",
}: Props) {
  // `useDecodeBody` IS the O1 model-side memoized decoded-entity accessor (PRO-354):
  // it gates decode on `body.atEnd` (lifecycle.phase === "ended") and returns a
  // decoded view only then, keyed on body identity. A separate `useDecodedEntity`
  // wrapper would be Option C (a view-side shim) — cut per the shim-vs-seam bar.
  const { loading, result } = useDecodeBody(body, cacheTo);
  const mediaTypeDisplay =
    result != null ? mediaTypeSlug(result.mediaType) : null;

  // Copy the content of the active view: parsed text, raw decoded text, or the
  // hex dump. hexDumpText is memoized since it walks every byte.
  const copyValue = useMemo(() => {
    if (result == null) return undefined;
    if (viewMode === "hex") return hexDumpText(result.bytes);
    if (viewMode === "raw") return result.rawText;
    return result.text;
  }, [result, viewMode]);

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
          {body != null && <CopyButton value={copyValue} />}
        </div>
      </div>

      {/* Body area. `min-h-0` lets the flex item shrink below its content
          height — without it, large bodies (e.g. the JSON viewer's virtualized
          spacer) push the container to their full size and break scroll
          virtualization downstream. */}
      <div className="flex-1 min-h-0 overflow-auto bg-card">
        {loading && <BodySkeleton />}

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

        {!loading && result != null && (
          <BodyContent result={result} viewMode={viewMode} />
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
