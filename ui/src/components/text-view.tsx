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

  return (
    <div className="font-mono text-xs leading-5 p-3" aria-label="Body text">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-3">
          <span className="select-none w-10 shrink-0 text-right text-muted-foreground">
            {i + 1}
          </span>
          <span className="flex-1 whitespace-pre-wrap break-words text-foreground">
            {line}
          </span>
        </div>
      ))}
    </div>
  );
}
