import { useMemo } from "react";

interface Props {
  text: string;
}

/**
 * The `raw` body view mode (PRO-336): the decompressed body decoded as plain
 * UTF-8 text with no pretty-printing or classification, shown with a line-number
 * gutter and long-line wrapping (no horizontal scroll).
 *
 * Not virtualized — this matches the existing unvirtualized `text`-kind `<pre>`
 * path in BodyPane; large-body truncation is tracked separately (PRO-155) and is
 * out of scope here.
 */
export function RawView({ text }: Props) {
  const lines = useMemo(() => text.split("\n"), [text]);

  return (
    <div
      className="font-mono text-xs leading-5 p-3"
      aria-label="Raw body viewer"
    >
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
