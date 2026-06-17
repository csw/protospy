// Adopted from the reui copy-button
// (raw.githubusercontent.com/keenthemes/reui/main/components/copy-button.tsx),
// retokenized to the v2.4 contract. Adapted, not authored (PRO-366): the
// docs-site cruft (analytics `trackEvent`, code-block absolute positioning,
// `bg-site-code`) is drained, imports point at our aliases/primitives, and copy
// feedback fires through the `sonner` toast host via `@ui/lib/toast` rather than
// being swallowed silently. Built on our shadcn `Button`, with icon→check
// copied-state feedback. Lives in the app namespace, not `components/ui/`.
//
// The prop surface is deliberately narrow — `value` + `className` — rather than
// re-exporting reui's full `Button` passthrough. Inheriting
// `React.ComponentProps<typeof Button>` would (a) collide our copy-text `value`
// with the native `<button value>` attribute and (b) let a caller's spread
// `onClick`/`disabled` clobber the copy handler. One internal caller (BodyPane)
// needs neither.
import * as React from "react";
import { Check, Copy } from "lucide-react";

import { notifyCopied, notifyCopyFailed } from "@ui/lib/toast";
import { Button } from "@ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui/components/ui/tooltip";

interface CopyButtonProps {
  /**
   * Text to copy. Optional so a caller can render the control before its text
   * is ready (e.g. a body still decoding); the button is disabled until `value`
   * is present, preserving the prior CopyButton's disabled-when-empty behavior.
   */
  value?: string;
  /**
   * Image body to copy as image data via `ClipboardItem` (PRO-420), instead of
   * text. When set, takes precedence over `value`. Used for `image/*` bodies,
   * where copying the decoded bytes as text would be meaningless.
   */
  image?: { bytes: Uint8Array; type: string };
  className?: string;
}

/**
 * Copy-to-clipboard button with copied-state feedback and a `sonner` toast.
 * Copies `value` as text, or — when `image` is given — the body as image data.
 */
export function CopyButton({ value, image, className }: CopyButtonProps) {
  const [hasCopied, setHasCopied] = React.useState(false);

  // Revert the copied state after 2s. Kept as an effect — the reui upstream
  // pattern — rather than a hand-managed timer ref: it's functionally correct,
  // and the single extra render when the timer flips `hasCopied` back is
  // negligible for a click-driven control. Preserving the adopted component's
  // shape is worth more than shaving one render (PRO-366 review round 2).
  React.useEffect(() => {
    if (hasCopied) {
      const timer = setTimeout(() => setHasCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [hasCopied]);

  const handleCopy = React.useCallback(async () => {
    try {
      if (image != null) {
        const blob = new Blob([new Uint8Array(image.bytes)], {
          type: image.type,
        });
        await navigator.clipboard.write([
          new ClipboardItem({ [image.type]: blob }),
        ]);
      } else if (value != null) {
        await navigator.clipboard.writeText(value);
      } else {
        return;
      }
      setHasCopied(true);
      notifyCopied();
    } catch {
      notifyCopyFailed();
    }
  }, [value, image]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-slot="copy-button"
          size="icon-xs"
          variant="ghost"
          disabled={value == null && image == null}
          className={className}
          onClick={handleCopy}
        >
          <span className="sr-only">{hasCopied ? "Copied" : "Copy"}</span>
          {hasCopied ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent sideOffset={4}>
        {hasCopied ? "Copied" : "Copy to clipboard"}
      </TooltipContent>
    </Tooltip>
  );
}
