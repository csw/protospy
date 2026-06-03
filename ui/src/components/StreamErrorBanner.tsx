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
      className="flex items-center gap-2 px-3 py-2 border-t border-border bg-red-bg shrink-0"
    >
      <AlertTriangle size={14} className="text-red/60 shrink-0" />
      <span className="font-family-mono text-xs text-red">{message}</span>
    </div>
  );
}
