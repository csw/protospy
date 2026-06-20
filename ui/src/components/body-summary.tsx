// Body summary state (PRO-420). The default view for binary bodies, showing
// content-type, decoded size, and a prominent download button as the primary
// action for unrenderable content.
import { Download } from "lucide-react";

import { buildSizeView, sizeText } from "@ui/lib/exchange";
import { Button } from "@ui/components/ui/button";

interface Props {
  mediaType: string;
  /** Wire (on-the-wire) byte count. */
  wireBytes: number;
  /** Decompressed byte count, when the body was compressed. */
  decodedBytes?: number;
  /** Raw `Content-Encoding`, for the shared size/encoding display. */
  contentEncoding?: string;
  onDownload: () => void;
}

export function BodySummary({
  mediaType,
  wireBytes,
  decodedBytes,
  contentEncoding,
  onDownload,
}: Props) {
  const view = buildSizeView(wireBytes, decodedBytes, contentEncoding);

  return (
    <div
      data-testid="body-summary"
      className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-muted-foreground">
          {mediaType}
        </span>
        <span
          className="font-mono text-xs text-muted-foreground"
          title={view.tooltip}
        >
          {sizeText(view)}
          {view.encoding && ` (${view.encoding})`}
        </span>
      </div>
      <Button size="sm" variant="secondary" onClick={onDownload}>
        <Download />
        Download
      </Button>
    </div>
  );
}
