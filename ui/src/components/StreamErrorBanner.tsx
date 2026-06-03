import { AlertTriangle } from "lucide-react";

interface Props {
  message: string;
}

/**
 * Error banner displayed at the bottom of SSE stream views when the
 * exchange has an error. Pinned below the scroll area so it's always
 * visible regardless of scroll position. Styled consistently with
 * BodyPane's mid-stream error banner.
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
