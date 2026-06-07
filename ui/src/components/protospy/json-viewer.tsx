// src/components/protospy/json-viewer.tsx — STUB.
// You are implementing the real viewer separately (custom, virtualized, with the
// research-backed design). This stub fixes only the token contract so the rest of
// the system renders against it: a two-column grid (line numbers + code) using the
// --json-* tokens via the text-json-* utilities. Swap the body for your impl.

import { cn } from "@/lib/utils";

type TokenKind = "key" | "string" | "number" | "boolean" | "null" | "punct";

const TOKEN_CLASS: Record<TokenKind, string> = {
  key: "text-json-key",
  string: "text-json-string",
  number: "text-json-number",
  boolean: "text-json-boolean",
  null: "text-json-null",
  punct: "text-json-punct",
};

/** Token classnames live here so the real viewer (and tests) share one source. */
export function jsonTokenClass(kind: TokenKind): string {
  return TOKEN_CLASS[kind];
}

export interface JsonViewerProps {
  /** Pre-tokenized lines from your parser; shape is illustrative. */
  lines: { tokens: { kind: TokenKind | "plain"; text: string }[] }[];
  startLine?: number;
  className?: string;
}

export function JsonViewer({
  lines,
  startLine = 1,
  className,
}: JsonViewerProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[auto_1fr] items-start py-2 font-mono text-mono leading-relaxed text-foreground",
        className,
      )}
    >
      {lines.map((line, i) => (
        <div className="contents" key={i}>
          <span className="select-none px-2 pr-3 text-right tabular-nums text-json-lineno">
            {startLine + i}
          </span>
          <code className="whitespace-pre pr-3">
            {line.tokens.map((t, j) => (
              <span
                key={j}
                className={
                  t.kind === "plain" ? undefined : jsonTokenClass(t.kind)
                }
              >
                {t.text}
              </span>
            ))}
          </code>
        </div>
      ))}
    </div>
  );
}
