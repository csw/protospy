interface Props {
  text: string;
}

interface Span {
  cls: string;
  text: string;
}

type Token = Span | string;

/**
 * Tokenize a single line of pretty-printed JSON into an array of
 * strings (unstyled) and Span objects (styled).
 */
function tokenizeLine(line: string): Token[] {
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
  const lines = text.split("\n");

  return (
    <div
      className="font-family-mono text-xs leading-5 overflow-auto w-full h-full"
      aria-label="JSON viewer"
    >
      {lines.map((line, i) => {
        const lineNum = i + 1;
        const tokens = tokenizeLine(line);
        return (
          <div key={lineNum} className="flex hover:bg-hl-bg">
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
  );
}
