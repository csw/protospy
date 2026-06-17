// Body summary state (PRO-420). The default view for binary bodies — and the
// interim view for image `rendered` mode until inline rendering lands
// (PRO-412) — showing content-type, decoded size, and a prominent download
// button as the primary action for unrenderable content.
import { Download } from "lucide-react";

import { formatSize } from "@ui/lib/utils";
import { Button } from "@ui/components/ui/button";

interface Props {
  mediaType: string;
  /** Wire (on-the-wire) byte count. */
  wireBytes: number;
  /** Decompressed byte count, when the body was compressed. */
  decodedBytes?: number;
  onDownload: () => void;
  /** Optional secondary line, e.g. an image-preview-pending note. */
  note?: string;
}

export function BodySummary({
  mediaType,
  wireBytes,
  decodedBytes,
  onDownload,
  note,
}: Props) {
  const size =
    decodedBytes != null
      ? `${formatSize(wireBytes)} / ${formatSize(decodedBytes)}`
      : formatSize(wireBytes);

  return (
    <div
      data-testid="body-summary"
      className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-muted-foreground">
          {mediaType}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{size}</span>
        {note != null && (
          <span className="font-sans text-xs text-muted-foreground">
            {note}
          </span>
        )}
      </div>
      <Button size="sm" variant="secondary" onClick={onDownload}>
        <Download />
        Download
      </Button>
    </div>
  );
}
