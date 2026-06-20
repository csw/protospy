import { useCallback, useMemo } from "react";
import { AlertTriangle, Download } from "lucide-react";
import type { BodyState } from "@ui/state/types";
import { useDecodeBody } from "@ui/hooks/useDecodeBody";
import type { DecodeResult } from "@ui/body/decode";
import {
  resolveMode,
  selectableModes,
  type ResolvedMode,
  type ViewMode,
} from "@ui/body/view-modes";
import { triggerDownload } from "@ui/lib/download";
import { buildSizeView, sizeText } from "@ui/lib/exchange";
import { fmtBytes, mediaTypeSlug } from "@ui/lib/format";
import { hexDumpText } from "@ui/lib/hex";
import { CopyButton } from "./copy-button";
import { BodyModeSelector } from "./body-mode-selector";
import { BodySummary } from "./body-summary";
import { TextView } from "./text-view";
import { MarkupView } from "./markup-view";
import { StreamErrorBanner } from "./stream-error-banner";
import { SimpleTooltip } from "./ui/simple-tooltip";
import { EmptyState } from "./ui/empty-state";
import { Skeleton } from "./ui/skeleton";
import { Button } from "./ui/button";
import { JsonTreeViewer } from "./json-tree";
import { HexView } from "./hex-view";
import { ImageView } from "./image-view";

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
function LifecycleState({
  children,
  busy = false,
}: {
  children: React.ReactNode;
  busy?: boolean;
}) {
  // `busy` marks the *loading* lifecycle states (awaiting a response, streaming
  // a body) with `aria-busy` — the standard "this region is still resolving"
  // signal. Terminal states (no body, undecodable) leave it unset. Screenshot
  // tooling waits on `aria-busy` to avoid capturing a half-loaded pane, so the
  // loading states must carry it regardless of whether they render as a
  // skeleton, a spinner, or text (see docs/ui/design-system.md hard rule 5).
  //
  // `busy || undefined` (not `busy`) so a falsy value omits the attribute
  // entirely rather than emitting `aria-busy="false"` — a terminal state has no
  // loading signal, it is not asserting "not busy". Don't simplify to `{busy}`.
  return (
    <div role="status" aria-busy={busy || undefined} className="h-full">
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
      aria-busy="true"
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
 * The decoded body rendered per the resolved view mode (PRO-420). `tree` is the
 * structured JSON/NDJSON viewer; `formatted` is the syntax-highlighted,
 * re-indented HTML/XML view (PRO-414), virtualized line-by-line and falling
 * back to plain text when the Worker produced no line tokens; `rendered` shows
 * an inline image preview (PRO-412) or the download summary for other kinds;
 * `summary` shows the download summary; `text`/`hex` are the kind-agnostic
 * fallbacks.
 */
function BodyContent({
  result,
  mode,
  onDownload,
}: {
  result: DecodeResult;
  mode: ResolvedMode;
  onDownload: () => void;
}) {
  if (mode === "hex") return <HexView bytes={result.bytes} />;

  if (mode === "tree") {
    if (result.kind === "json" && result.parsed != null) {
      // Wrap so the JSON viewer gets the same top inset as the other views.
      // h-full resolves against the wrapper's content box, keeping the viewer
      // below the padding without overflow.
      return (
        <div className="h-full pt-3 pl-3">
          <JsonTreeViewer
            value={result.parsed}
            initialRows={result.initialRows}
            initialExpanded={result.initialExpanded}
            truncated={result.truncated}
            aria-label="JSON viewer"
          />
        </div>
      );
    }
    if (result.kind === "ndjson" && result.documents != null) {
      return (
        <div className="h-full pt-3 pl-3">
          <JsonTreeViewer
            documents={result.documents}
            initialRows={result.initialRows}
            initialExpanded={result.initialExpanded}
            truncated={result.truncated}
            aria-label="NDJSON viewer"
          />
        </div>
      );
    }
  }

  if (mode === "rendered") {
    if (result.kind === "image") {
      return <ImageView bytes={result.bytes} mediaType={result.mediaType} />;
    }
    return (
      <BodySummary
        mediaType={result.mediaType}
        wireBytes={result.wireBytes}
        decodedBytes={result.decodedBytes}
        contentEncoding={result.contentEncoding}
        onDownload={onDownload}
      />
    );
  }

  if (mode === "summary") {
    return (
      <BodySummary
        mediaType={result.mediaType}
        wireBytes={result.wireBytes}
        decodedBytes={result.decodedBytes}
        contentEncoding={result.contentEncoding}
        onDownload={onDownload}
      />
    );
  }

  // `formatted` (HTML/XML, PRO-414): the virtualized syntax-highlighted view
  // when the Worker produced line tokens; otherwise fall through to plain text.
  if (mode === "formatted" && result.lines != null) {
    return (
      <MarkupView
        lines={result.lines}
        label={result.kind === "html" ? "HTML viewer" : "XML viewer"}
      />
    );
  }

  // `text`, and `formatted` with no line tokens (worker failure fallback).
  return <TextView text={result.rawText} />;
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
   * This pane's stored view-mode selection (PRO-420): `null` means "use the
   * default for the content kind"; an explicit value is the user's choice.
   * Passed in (not read from the store) so this pane stays presentational.
   */
  viewMode?: ViewMode | null;
  /** Change this pane's stored selection; `null` returns to the default. */
  onViewModeChange?: (mode: ViewMode | null) => void;
  /** Filename for the header-strip download button, resolved by BodySplit. */
  downloadFilename?: string;
}

export function BodyPane({
  title,
  body,
  errorMessage,
  awaiting,
  cacheTo,
  viewMode = null,
  onViewModeChange,
  downloadFilename = "body.bin",
}: Props) {
  // `useDecodeBody` IS the O1 model-side memoized decoded-entity accessor (PRO-354):
  // it gates decode on `body.atEnd` (lifecycle.phase === "ended") and returns a
  // decoded view only then, keyed on body identity. A separate `useDecodedEntity`
  // wrapper would be Option C (a view-side shim) — cut per the shim-vs-seam bar.
  const { loading, result } = useDecodeBody(body, cacheTo);
  const mediaTypeDisplay =
    result != null ? mediaTypeSlug(result.mediaType) : null;

  // Shared size/encoding model — same wire/decoded figure, encoding tag, and
  // tooltip wording as the list rows and inspector facts.
  const bodySizeView =
    result != null
      ? buildSizeView(
          result.wireBytes,
          result.decodedBytes,
          result.contentEncoding,
        )
      : null;

  // Resolve the active mode against this body's content kind: a stored mode
  // that isn't available here silently falls back to the kind's default.
  const modes =
    result != null ? selectableModes(result.kind, result.textAvailable) : [];
  const resolved: ResolvedMode | null =
    result != null
      ? resolveMode(viewMode, result.kind, result.textAvailable)
      : null;

  const handleDownload = useCallback(() => {
    if (result == null) return;
    triggerDownload(result.bytes, downloadFilename, result.mediaType);
  }, [result, downloadFilename]);

  // Copy the active view's content: the hex dump in hex mode, the body as image
  // data for images, the decoded/pretty text otherwise. Non-image binary has
  // nothing meaningful to copy, so the button is omitted. hexDumpText is
  // memoized since it walks every byte.
  const copyText = useMemo(() => {
    if (result == null) return undefined;
    if (resolved === "hex") return hexDumpText(result.bytes);
    if (resolved === "tree") return result.text;
    // Formatted markup copies the re-indented source; everything else the raw.
    if (resolved === "formatted") return result.text ?? result.rawText;
    return result.rawText;
  }, [result, resolved]);

  // Hex mode copies the dump for any kind; otherwise an image copies its raw
  // bytes, non-image binary has nothing meaningful to copy, and everything else
  // copies the active view's text.
  const copyButton =
    result == null || body == null ? null : resolved === "hex" ? (
      <CopyButton value={copyText} />
    ) : result.kind === "image" ? (
      <CopyButton image={{ bytes: result.bytes, type: result.mediaType }} />
    ) : result.kind === "binary" ? null : (
      <CopyButton value={copyText} />
    );

  return (
    <div className="flex flex-col border border-border h-full overflow-hidden">
      <div
        data-testid="body-pane-subhead"
        className="flex h-strip shrink-0 items-center gap-3 border-b border-border bg-secondary px-3"
      >
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
          {result != null && resolved != null && (
            <BodyModeSelector
              modes={modes}
              current={resolved}
              onSelect={(m) => onViewModeChange?.(m)}
            />
          )}
          {bodySizeView != null && (
            <SimpleTooltip content={bodySizeView.tooltip}>
              <span
                className="font-mono text-xs text-muted-foreground"
                data-testid="body-size"
              >
                {sizeText(bodySizeView)}
                {bodySizeView.encoding && ` (${bodySizeView.encoding})`}
              </span>
            </SimpleTooltip>
          )}
          {result != null && (
            <SimpleTooltip content="Download body">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={handleDownload}
                aria-label="Download body"
              >
                <Download />
              </Button>
            </SimpleTooltip>
          )}
          {copyButton}
        </div>
      </div>

      {/* Body area. `min-h-0` lets the flex item shrink below its content
          height — without it, large bodies (e.g. the JSON viewer's virtualized
          spacer) push the container to their full size and break scroll
          virtualization downstream. */}
      <div className="flex-1 min-h-0 overflow-auto bg-card">
        {loading && <BodySkeleton />}

        {!loading && body != null && !body.atEnd && errorMessage == null && (
          <LifecycleState busy>
            Streaming… ({fmtBytes(body.wireBytes)} received)
          </LifecycleState>
        )}

        {!loading && body != null && !body.atEnd && errorMessage != null && (
          <ErrorPanel
            title="Response interrupted"
            message={errorMessage}
            detail={`${fmtBytes(body.wireBytes)} received before error`}
          />
        )}

        {!loading && body == null && errorMessage != null && (
          <ErrorPanel title="Error" message={errorMessage} />
        )}

        {/* No body yet: distinguish "the response hasn't begun" (awaiting) from a
            genuinely body-less response (GET / 204) — not a flat "pending". */}
        {!loading && body == null && errorMessage == null && (
          <LifecycleState busy={awaiting}>
            {awaiting ? "Awaiting response…" : "No body"}
          </LifecycleState>
        )}

        {!loading && body != null && body.atEnd && result == null && (
          <LifecycleState>Could not decode body</LifecycleState>
        )}

        {!loading && result != null && resolved != null && (
          <BodyContent
            result={result}
            mode={resolved}
            onDownload={handleDownload}
          />
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
