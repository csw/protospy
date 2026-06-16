import { Download } from "lucide-react";
import { Button } from "@ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui/components/ui/tooltip";
import { downloadBytes } from "@ui/lib/download";

interface DownloadButtonProps {
  /** Bytes to download. Button is disabled until this is set. */
  bytes?: Uint8Array;
  /** Filename for the downloaded file. */
  filename?: string;
  /** MIME type for the Blob. */
  mimeType?: string;
  className?: string;
  /** Visual size variant: "icon-xs" for the header toolbar, "sm" for prominent placements. */
  size?: "icon-xs" | "sm";
}

/**
 * Download-to-file button. Triggers a browser file download of `bytes` using
 * the Blob + object-URL pattern. Disabled until all three of bytes/filename/mimeType
 * are present.
 */
export function DownloadButton({
  bytes,
  filename,
  mimeType,
  className,
  size = "icon-xs",
}: DownloadButtonProps) {
  const ready = bytes != null && filename != null && mimeType != null;

  function handleDownload() {
    if (!ready) return;
    downloadBytes(bytes, filename, mimeType);
  }

  if (size === "sm") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
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
        </TooltipTrigger>
        <TooltipContent sideOffset={4}>Download file</TooltipContent>
      </Tooltip>
    );
  }

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
