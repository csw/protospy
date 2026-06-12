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
import { JsonTreeViewer } from "./json-tree-viewer";
import type { JsonValue } from "./model";

interface Fixture {
  id: string;
  label: string;
  value: JsonValue;
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
  const [fixtureId, setFixtureId] = useState(FIXTURES[0].id);
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

  const fixture = FIXTURES.find((f) => f.id === fixtureId) ?? FIXTURES[0];

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
        {FIXTURES.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={f.id === fixtureId ? "default" : "outline"}
            data-testid={`fixture-${f.id}`}
            onClick={() => setFixtureId(f.id)}
          >
            {f.label}
          </Button>
        ))}
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
      <div
        className="min-h-0 flex-1 p-2"
        data-testid="json-tree-harness-viewport"
      >
        <JsonTreeViewer value={fixture.value} />
      </div>
    </div>
  );
}
