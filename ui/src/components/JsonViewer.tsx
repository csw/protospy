import { useCallback, useMemo, useRef, useState } from "react";
import {
  useVirtualizer,
  observeElementRect as defaultObserveRect,
} from "@tanstack/react-virtual";
import { ChevronRight } from "lucide-react";
import { cn } from "@ui/lib/utils";
import { Button } from "@ui/components/ui/button";
import {
  buildJsonTree,
  flattenTree,
  computeAutoExpanded,
  type FlatLine,
} from "@ui/lib/json-tree";

interface Props {
  text: string;
  kind?: "json" | "jsonl";
  /** Pre-parsed JSON value from the decode pipeline, avoids re-parsing text. */
  parsed?: unknown;
}

// `text-xs` (12px) + `leading-5` (20px) — each line renders as a 20px row.
const ROW_HEIGHT = 20;

/** Pixels of indentation per nesting depth level in the tree view. */
const INDENT_PX = 16;

/** Shared aria-label for the viewer scroll container — owned by JsonViewer. */
const VIEWER_LABEL = "JSON viewer";

/**
 * Wrapper around the default observeElementRect that handles jsdom (or any
 * environment where getBoundingClientRect returns a 0x0 rect). When the real
 * rect has zero dimensions, we report a fallback rect so the virtualizer
 * renders items and component tests can assert on them.
 */
const observeElementRect: typeof defaultObserveRect = (instance, cb) => {
  return defaultObserveRect(instance, (rect) => {
    if (rect.width === 0 && rect.height === 0) {
      cb({ width: 800, height: 600 });
    } else {
      cb(rect);
    }
  });
};

// ── Line tokenizer (used by the flat view for JSONL) ──

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

    // Boolean / null
    const boolMatch = /^(true|false|null)/.exec(rest);
    if (boolMatch) {
      tokens.push({ cls: "text-json-boolean", text: boolMatch[1] });
      rest = rest.slice(boolMatch[1].length);
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

// ── Parse result wrapper ──

type ParseResult = { ok: true; value: unknown } | { ok: false };

// ── Main component ──

export function JsonViewer({ text, kind = "json", parsed: preParsed }: Props) {
  const parsed: ParseResult = useMemo(() => {
    if (kind !== "json") return { ok: false };
    // Use pre-parsed value from the decode pipeline when available
    if (preParsed !== undefined) return { ok: true, value: preParsed };
    try {
      return { ok: true, value: JSON.parse(text) as unknown };
    } catch {
      return { ok: false };
    }
  }, [text, kind, preParsed]);

  if (parsed.ok) {
    return <JsonTreeView value={parsed.value} />;
  }

  return <JsonFlatView text={text} />;
}

// ── Tree view ──

function JsonTreeView({ value }: { value: unknown }) {
  const tree = useMemo(() => buildJsonTree(value), [value]);
  const autoExpanded = useMemo(() => computeAutoExpanded(tree), [tree]);

  // "Set state during render" pattern — reset expanded when tree changes
  // (i.e. a different exchange was selected). We track `value` identity
  // rather than tree.id because buildJsonTree always starts its counter
  // at 0 (root id is always 0). `value` comes from a useMemo keyed on
  // the decode result, so its identity changes exactly when the JSON body
  // changes.
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(autoExpanded);
  const [prevValue, setPrevValue] = useState(value);

  if (value !== prevValue) {
    setPrevValue(value);
    setExpanded(autoExpanded);
  }

  const lines = useMemo(() => flattenTree(tree, expanded), [tree, expanded]);

  const toggle = useCallback((nodeId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const parentRef = useRef<HTMLDivElement>(null);

  // React Compiler bails out on useVirtualizer (react-hooks/incompatible-library)
  // because its methods close over mutable instance state. Safe to ignore: we
  // don't enable the compiler in this build, and the returned methods are consumed
  // inline in this render.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    observeElementRect,
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
          const line = lines[vRow.index];
          const expandable = line.kind === "open" || line.kind === "collapsed";
          return (
            <div
              key={vRow.key}
              className={cn(
                "flex items-center hover:bg-accent",
                expandable && "cursor-pointer",
              )}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: vRow.size,
                transform: `translateY(${vRow.start}px)`,
              }}
              onClick={expandable ? () => toggle(line.nodeId) : undefined}
            >
              {/* Indent + toggle column */}
              <span
                className="shrink-0 inline-flex items-center justify-end"
                style={{ width: `${line.depth * INDENT_PX + 16}px` }}
              >
                {expandable && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-4 text-json-punct hover:bg-accent hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(line.nodeId);
                    }}
                    aria-expanded={line.kind === "open"}
                    aria-label={line.kind === "open" ? "Collapse" : "Expand"}
                  >
                    <ChevronRight
                      className={cn(
                        "transition-transform duration-100",
                        line.kind === "open" && "rotate-90",
                      )}
                    />
                  </Button>
                )}
              </span>

              {/* Content */}
              <span className="whitespace-pre">
                {line.key != null && (
                  <>
                    <span className="text-json-key">
                      {JSON.stringify(line.key)}
                    </span>
                    <span className="text-json-punct">: </span>
                  </>
                )}
                <LineValue line={line} />
                {line.hasComma && <span className="text-json-punct">,</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Render the value portion of a flat line (bracket, collapsed preview, or leaf value). */
function LineValue({ line }: { line: FlatLine }) {
  switch (line.kind) {
    case "open":
      return (
        <span className="text-json-punct">
          {line.containerType === "object" ? "{" : "["}
        </span>
      );

    case "close":
      return (
        <span className="text-json-punct">
          {line.containerType === "object" ? "}" : "]"}
        </span>
      );

    case "collapsed": {
      const isArray = line.containerType === "array";
      const open = isArray ? "[" : "{";
      const close = isArray ? "]" : "}";
      const count = line.childCount ?? 0;
      // Show item count for arrays (useful for sizing); omit for objects
      // (property count is less informative and adds visual noise).
      const label = isArray
        ? count === 1
          ? "1 item"
          : `${count} items`
        : undefined;
      return (
        <>
          <span className="text-json-punct">{open}</span>
          <span className="text-muted-foreground italic">{"…"}</span>
          <span className="text-json-punct">{close}</span>
          {label != null && (
            <span className="text-muted-foreground ml-2">{label}</span>
          )}
        </>
      );
    }

    case "leaf":
      return <span className={line.valueCls}>{line.valueText}</span>;
  }
}

// ── Flat view (used for JSONL and as parse-failure fallback) ──

function JsonFlatView({ text }: { text: string }) {
  const lines = useMemo(() => text.split("\n"), [text]);
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    observeElementRect,
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
              className="flex hover:bg-accent"
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
