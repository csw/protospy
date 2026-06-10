// Adopted from the reui copy-button
// (raw.githubusercontent.com/keenthemes/reui/main/components/copy-button.tsx),
// retokenized to the v2.4 contract. Adapted, not authored (PRO-366): the
// docs-site cruft (analytics `trackEvent`, code-block absolute positioning,
// `bg-site-code`) is drained, imports point at our aliases/primitives, and copy
// feedback fires through the `sonner` toast host via `@ui/lib/toast` rather than
// being swallowed silently. Built on our shadcn `Button`, with icon→check
// copied-state feedback. Lives in the app namespace, not `components/ui/`.
import * as React from "react";
import { Check, Copy } from "lucide-react";

import { notifyCopied, notifyCopyFailed } from "@ui/lib/toast";
import { Button } from "@ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui/components/ui/tooltip";

/**
 * Copy-to-clipboard button with copied-state feedback and a `sonner` toast.
 *
 * `value` is optional so a caller can render the control before its text is
 * ready (e.g. a body still decoding); the button is disabled until `value` is
 * present, preserving the prior CopyButton's disabled-when-empty behavior.
 */
export function CopyButton({
  value,
  className,
  variant = "ghost",
  ...props
}: React.ComponentProps<typeof Button> & {
  value?: string;
}) {
  const [hasCopied, setHasCopied] = React.useState(false);

  React.useEffect(() => {
    if (hasCopied) {
      const timer = setTimeout(() => setHasCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [hasCopied]);

  async function handleCopy() {
    if (value == null) return;
    try {
      await navigator.clipboard.writeText(value);
      setHasCopied(true);
      notifyCopied();
    } catch {
      notifyCopyFailed();
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-slot="copy-button"
          size="icon-xs"
          variant={variant}
          disabled={value == null}
          className={className}
          onClick={handleCopy}
          {...props}
        >
          <span className="sr-only">Copy</span>
          {hasCopied ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {hasCopied ? "Copied" : "Copy to clipboard"}
      </TooltipContent>
    </Tooltip>
  );
}
