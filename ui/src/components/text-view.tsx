import { useMemo } from "react";

interface Props {
  text: string;
}

/**
 * The `text` body view mode (PRO-420; also the interim `formatted` rendering
 * until syntax highlighting lands in PRO-414): the decoded body shown as plain
 * UTF-8 text with a line-number gutter and long-line wrapping (no horizontal
 * scroll).
 *
 * Not virtualized — virtualization for large text bodies is tracked separately
 * (PRO-416) and is out of scope here.
 */
export function TextView({ text }: Props) {
  const lines = useMemo(() => text.split("\n"), [text]);
  // Size gutter to fit the actual line count rather than a fixed reserve.
  // For n lines, log10(n+1) gives the digit count; clamp to 2 chars minimum.
  const gutterWidth = useMemo(
    () => `${Math.max(Math.ceil(Math.log10(lines.length + 1)), 2)}ch`,
    [lines.length],
  );

  return (
    <div className="font-mono text-xs leading-5 p-3" aria-label="Body text">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-3">
          <span
            data-testid="line-number"
            className="select-none shrink-0 text-right text-muted-foreground"
            style={{ width: gutterWidth }}
          >
            {i + 1}
          </span>
          <span className="flex-1 whitespace-pre-wrap wrap-anywhere text-foreground">
            {line}
          </span>
        </div>
      ))}
    </div>
  );
}
