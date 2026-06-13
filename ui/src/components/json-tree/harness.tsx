/**
 * Dev/test-only standalone harness for {@link JsonTreeViewer} (phase 1a,
 * PRO-397). The component isn't wired into the body pane yet (phase 1b); this
 * harness lets visual review and the Playwright browser suite drive the real
 * component with representative fixtures, in either theme.
 *
 * Mounted from `main.tsx` at the `#json-tree-harness` hash, gated behind the
 * same dev/test-hooks flag as the scene harness, so it (and its fixtures) are
 * dead-code-eliminated from a plain production build.
 */

import { useState } from "react";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Textarea } from "@ui/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@ui/components/ui/toggle-group";
import { JsonTreeViewer } from "./json-tree-viewer";
import type { JsonValue } from "./model";

interface Fixture {
  id: string;
  label: string;
  value: JsonValue;
}

/** Source id for the "paste / load a file" custom-input mode. */
const CUSTOM_ID = "custom";

/** Result of parsing the custom-input text into a renderable value. */
export type ParsedInput =
  | { status: "empty" }
  | { status: "ok"; value: JsonValue }
  | { status: "error"; message: string };

/**
 * Parse the harness's custom-input text. Blank input is "empty" (a prompt, not
 * an error); anything else is run through `JSON.parse`, with the parse failure
 * surfaced as a message. Exported for unit testing.
 */
export function parseJsonInput(text: string): ParsedInput {
  if (text.trim() === "") return { status: "empty" };
  try {
    return { status: "ok", value: JSON.parse(text) as JsonValue };
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** A representative Elasticsearch search response (hits with nested _source). */
const ES_RESPONSE: JsonValue = {
  took: 5,
  timed_out: false,
  _shards: { total: 5, successful: 5, skipped: 0, failed: 0 },
  hits: {
    total: { value: 1234, relation: "eq" },
    max_score: 1.0,
    hits: Array.from({ length: 10 }, (_, i) => ({
      _index: "products",
      _id: `prod-${i}`,
      _score: 1 - i * 0.01,
      _source: {
        name: `Product ${i}`,
        price: 19.99 + i,
        in_stock: i % 2 === 0,
        tags: ["sale", "featured", `cat-${i % 3}`],
        attributes: { color: i % 2 === 0 ? "red" : "blue", weight_kg: 0.5 + i },
      },
    })),
  },
  aggregations: {
    by_category: {
      buckets: Array.from({ length: 4 }, (_, i) => ({
        key: `category-${i}`,
        doc_count: 100 - i * 7,
      })),
    },
  },
};

const FIXTURES: Fixture[] = [
  {
    id: "es",
    label: "ES response",
    value: ES_RESPONSE,
  },
  {
    id: "small",
    label: "Small object",
    value: {
      name: "Alice",
      age: 30,
      active: true,
      tags: ["admin", "user"],
    },
  },
  {
    id: "types",
    label: "All types",
    value: {
      string: "hello",
      number: 42,
      float: -3.14,
      boolean: false,
      null_value: null,
      empty_object: {},
      empty_array: [],
    },
  },
  {
    id: "deep",
    label: "Deeply nested",
    value: {
      a: {
        b: {
          c: {
            d: {
              e: {
                f: {
                  g: "a value buried deep inside a long horizontal nesting chain that overflows the viewport",
                },
              },
            },
          },
        },
      },
    },
  },
  {
    id: "large-array",
    label: "Large array",
    value: {
      items: Array.from({ length: 250 }, (_, i) => ({
        id: i,
        value: `item ${i}`,
      })),
    },
  },
];

export function JsonTreeHarness() {
  const [sourceId, setSourceId] = useState(FIXTURES[0].id);
  const [customText, setCustomText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

  const isCustom = sourceId === CUSTOM_ID;
  const fixture = FIXTURES.find((f) => f.id === sourceId) ?? FIXTURES[0];
  const parsed: ParsedInput = isCustom
    ? parseJsonInput(customText)
    : { status: "ok", value: fixture.value };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const loadFile = async (file: File) => {
    const text = await file.text();
    setCustomText(text);
    setFileName(file.name);
    setSourceId(CUSTOM_ID);
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
        <ToggleGroup
          type="single"
          size="sm"
          value={sourceId}
          onValueChange={(v) => v && setSourceId(v)}
        >
          {FIXTURES.map((f) => (
            <ToggleGroupItem
              key={f.id}
              value={f.id}
              data-testid={`fixture-${f.id}`}
              className="px-2 text-xs"
            >
              {f.label}
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem
            value={CUSTOM_ID}
            data-testid="source-custom"
            className="px-2 text-xs"
          >
            Custom
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            data-testid="toggle-theme"
            onClick={toggleTheme}
          >
            {dark ? "Light" : "Dark"} theme
          </Button>
        </div>
      </div>
      {isCustom && (
        <div className="flex flex-col gap-2 border-b border-border p-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="file"
              accept="application/json,.json,.txt"
              aria-label="Load a JSON file"
              data-testid="custom-file"
              className="h-9 w-auto py-1.5 text-xs"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void loadFile(file);
                // Reset so re-selecting the same file fires onChange again.
                e.target.value = "";
              }}
            />
            {fileName && (
              <span className="text-xs text-muted-foreground">{fileName}</span>
            )}
            <Button
              size="sm"
              variant="outline"
              data-testid="custom-clear"
              disabled={customText === ""}
              onClick={() => {
                setCustomText("");
                setFileName(null);
              }}
            >
              Clear
            </Button>
          </div>
          <Textarea
            value={customText}
            spellCheck={false}
            aria-label="Paste JSON to preview"
            placeholder="Paste JSON here, or load a file above…"
            data-testid="custom-input"
            aria-invalid={parsed.status === "error"}
            className="h-28 resize-none font-mono text-xs"
            onChange={(e) => {
              setCustomText(e.target.value);
              setFileName(null);
            }}
          />
          {parsed.status === "error" && (
            <p className="text-xs text-destructive" data-testid="custom-error">
              Invalid JSON: {parsed.message}
            </p>
          )}
        </div>
      )}
      <div
        className="min-h-0 flex-1 p-2"
        data-testid="json-tree-harness-viewport"
      >
        {parsed.status === "ok" ? (
          <JsonTreeViewer value={parsed.value} />
        ) : (
          <p className="p-2 text-sm text-muted-foreground">
            {parsed.status === "empty"
              ? "Paste JSON or load a file above to preview it."
              : "Fix the JSON above to preview it."}
          </p>
        )}
      </div>
    </div>
  );
}
