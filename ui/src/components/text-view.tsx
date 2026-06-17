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
  const { lines, gutterWidth } = useMemo(() => {
    const lines = text.split("\n");
    // Size gutter to fit the actual line count rather than a fixed reserve.
    // Math.log10(1) = 0 → 1 digit; clamp to a 2-char minimum for readability.
    const digits = Math.max(Math.ceil(Math.log10(lines.length + 1)), 2);
    return { lines, gutterWidth: `${digits}ch` };
  }, [text]);

  return (
    <div className="font-mono text-xs leading-5 p-3" aria-label="Body text">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-3">
          <span
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
