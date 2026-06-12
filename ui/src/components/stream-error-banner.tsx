import { AlertTriangle } from "lucide-react";

interface Props {
  message: string;
}

/**
 * Error banner for stream views and body panes. Rendered as a flex
 * child with `shrink-0` so it holds its height while the sibling
 * scroll area absorbs available space. Used by StreamView,
 * ChatStreamView, and BodyPane for mid-stream / post-stream errors.
 */
export function StreamErrorBanner({ message }: Props) {
  return (
    <div
      data-testid="stream-error-banner"
      className="flex items-center gap-2 px-3 py-2 border-t border-border bg-error-bg shrink-0 mb-2"
    >
      <AlertTriangle size={14} className="text-error/60 shrink-0" />
      <span className="font-mono text-xs text-error min-w-0 wrap-anywhere">
        {message}
      </span>
    </div>
  );
}
