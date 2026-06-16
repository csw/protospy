import { useCallback } from "react";
import { Download } from "lucide-react";
import { Button } from "@ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui/components/ui/tooltip";
import { downloadBytes } from "@ui/lib/download";

interface DownloadButtonBaseProps {
  /** Bytes to download. Button is disabled until all three of bytes/filename/mimeType are present. */
  bytes?: Uint8Array;
  /** Filename for the downloaded file. */
  filename?: string;
  /** MIME type for the Blob. */
  mimeType?: string;
  className?: string;
}

/**
 * Icon-only download button for use in toolbar / header areas.
 * Renders as a ghost icon button with a tooltip.
 */
export function DownloadIconButton({
  bytes,
  filename,
  mimeType,
  className,
}: DownloadButtonBaseProps) {
  const ready = bytes != null && filename != null && mimeType != null;

  const handleDownload = useCallback(() => {
    if (!ready) return;
    downloadBytes(bytes, filename, mimeType);
  }, [bytes, filename, mimeType, ready]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-slot="download-button"
          size="icon-xs"
          variant="ghost"
          disabled={!ready}
          className={className}
          onClick={handleDownload}
        >
          <span className="sr-only">Download</span>
          <Download />
        </Button>
      </TooltipTrigger>
      <TooltipContent sideOffset={4}>Download file</TooltipContent>
    </Tooltip>
  );
}

/**
 * Labeled download button for prominent placements (e.g. binary empty state).
 * Renders as an outline button with icon and "Download" label.
 */
export function DownloadButton({
  bytes,
  filename,
  mimeType,
  className,
}: DownloadButtonBaseProps) {
  const ready = bytes != null && filename != null && mimeType != null;

  const handleDownload = useCallback(() => {
    if (!ready) return;
    downloadBytes(bytes, filename, mimeType);
  }, [bytes, filename, mimeType, ready]);

  return (
    <Button
      data-slot="download-button"
      size="sm"
      variant="outline"
      disabled={!ready}
      className={className}
      onClick={handleDownload}
    >
      <Download data-icon="inline-start" />
      Download
    </Button>
  );
}
