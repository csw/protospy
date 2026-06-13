import { useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { observeElementRectWithFallback } from "@ui/lib/virtual";

// One row is a single `leading-5` line (20px).
const ROW_HEIGHT = 20;

/** Shared aria-label for the flat viewer scroll container. */
const VIEWER_LABEL = "JSON viewer";

// ── Line tokenizer ──

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
      tokens.push({ cls: "text-json-key", text: full.slice(0, colonIdx) });
      tokens.push({ cls: "text-json-punct", text: ":" });
      rest = rest.slice(full.length);
      continue;
    }

    // String value
    const strMatch = /^("(?:[^"\\]|\\.)*")/.exec(rest);
    if (strMatch) {
      tokens.push({ cls: "text-json-string", text: strMatch[1] });
      rest = rest.slice(strMatch[1].length);
      continue;
    }

    // Number
    const numMatch = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest);
    if (numMatch) {
      tokens.push({ cls: "text-json-number", text: numMatch[1] });
      rest = rest.slice(numMatch[1].length);
      continue;
    }

    // Boolean
    const boolMatch = /^(true|false)/.exec(rest);
    if (boolMatch) {
      tokens.push({ cls: "text-json-boolean", text: boolMatch[1] });
      rest = rest.slice(boolMatch[1].length);
      continue;
    }

    // Null
    const nullMatch = /^(null)/.exec(rest);
    if (nullMatch) {
      tokens.push({ cls: "text-json-null", text: nullMatch[1] });
      rest = rest.slice(nullMatch[1].length);
      continue;
    }

    // Punctuation: { } [ ] , (colon already handled above)
    const punctMatch = /^([{}[\],])/.exec(rest);
    if (punctMatch) {
      tokens.push({ cls: "text-json-punct", text: punctMatch[1] });
      rest = rest.slice(punctMatch[1].length);
      continue;
    }

    // Fallback: consume one character unstyled
    tokens.push(rest[0]);
    rest = rest.slice(1);
  }

  return tokens;
}

// ── Flat view (used for JSONL bodies) ──

export function JsonFlatView({ text }: { text: string }) {
  const lines = useMemo(() => text.split("\n"), [text]);
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    observeElementRect: observeElementRectWithFallback,
  });

  return (
    <div
      ref={parentRef}
      className="font-mono text-xs leading-5 overflow-auto w-full h-full"
      style={{ contain: "strict" }}
      aria-label={VIEWER_LABEL}
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
              key={vRow.key}
              className="flex hover:bg-hover"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: vRow.size,
                transform: `translateY(${vRow.start}px)`,
              }}
            >
              <span className="select-none w-10 shrink-0 text-right pr-3 text-json-lineno">
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
