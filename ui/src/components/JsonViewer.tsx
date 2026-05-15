import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface Props {
  text: string;
}

// `text-xs` (12px) + `leading-5` (20px) — each line renders as a 20px row.
const ROW_HEIGHT = 20;

interface Span {
  cls: string;
  text: string;
}

type Token = Span | string;

/**
 * Tokenize a single line of pretty-printed JSON into an array of
 * strings (unstyled) and Span objects (styled).
 */
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let rest = line;

  while (rest.length > 0) {
    // Leading whitespace — pass through unstyled
    const wsMatch = /^(\s+)/.exec(rest);
    if (wsMatch) {
      tokens.push(wsMatch[1]);
      rest = rest.slice(wsMatch[1].length);
      continue;
    }

    // Property key: "key":
    const keyMatch = /^("(?:[^"\\]|\\.)*"\s*:)/.exec(rest);
    if (keyMatch) {
      // Separate the colon from the quoted key for styling
      const full = keyMatch[1];
      const colonIdx = full.lastIndexOf(":");
      tokens.push({ cls: "text-j-key", text: full.slice(0, colonIdx) });
      tokens.push({ cls: "text-j-punct", text: ":" });
      rest = rest.slice(full.length);
      continue;
    }

    // String value
    const strMatch = /^("(?:[^"\\]|\\.)*")/.exec(rest);
    if (strMatch) {
      tokens.push({ cls: "text-j-str", text: strMatch[1] });
      rest = rest.slice(strMatch[1].length);
      continue;
    }

    // Number
    const numMatch = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest);
    if (numMatch) {
      tokens.push({ cls: "text-j-num", text: numMatch[1] });
      rest = rest.slice(numMatch[1].length);
      continue;
    }

    // Boolean / null
    const boolMatch = /^(true|false|null)/.exec(rest);
    if (boolMatch) {
      tokens.push({ cls: "text-j-bool", text: boolMatch[1] });
      rest = rest.slice(boolMatch[1].length);
      continue;
    }

    // Punctuation: { } [ ] , (colon already handled above)
    const punctMatch = /^([{}[\],])/.exec(rest);
    if (punctMatch) {
      tokens.push({ cls: "text-j-punct", text: punctMatch[1] });
      rest = rest.slice(punctMatch[1].length);
      continue;
    }

    // Fallback: consume one character unstyled
    tokens.push(rest[0]);
    rest = rest.slice(1);
  }

  return tokens;
}

export function JsonViewer({ text }: Props) {
  const lines = useMemo(() => text.split("\n"), [text]);
  const parentRef = useRef<HTMLDivElement>(null);

  // Virtualize the line list. A 2 MB pretty-printed JSON is ~100K lines, and
  // mounting every row blocks the main thread for seconds. Rendering only the
  // visible window keeps the DOM small (~50 rows) regardless of body size.
  //
  // React Compiler bails out on useVirtualizer (`react-hooks/incompatible-library`)
  // because its methods close over mutable instance state. Safe to ignore here:
  // we don't enable the compiler in this build, and the returned methods are
  // consumed inline in this render — they're never handed to a memoized child.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div
      ref={parentRef}
      className="font-family-mono text-xs leading-5 overflow-auto w-full h-full"
      style={{ contain: "strict" }}
      aria-label="JSON viewer"
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => {
          const i = vRow.index;
          const lineNum = i + 1;
          const tokens = tokenizeLine(lines[i]);
          return (
            <div
              key={lineNum}
              className="flex hover:bg-bg-hl"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: vRow.size,
                transform: `translateY(${vRow.start}px)`,
              }}
            >
              <span className="select-none w-10 shrink-0 text-right pr-3 text-j-ln">
                {lineNum}
              </span>
              <span className="flex-1 whitespace-pre">
                {tokens.map((tok, ti) =>
                  typeof tok === "string" ? (
                    tok
                  ) : (
                    <span key={ti} className={tok.cls}>
                      {tok.text}
                    </span>
                  ),
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
