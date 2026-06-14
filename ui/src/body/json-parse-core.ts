/**
 * Pure JSON parse-and-format logic. Imported by the Worker script and by unit
 * tests that need to exercise it in the Node environment without a real Worker.
 */

import type { JsonValue } from "../components/json-tree/model";

export interface ParseResult {
  /** The parsed JavaScript value. Transferred to the main thread via structured-clone. */
  parsed: JsonValue;
  /** The original value re-serialised with 2-space indentation. */
  prettyText: string;
}

/**
 * Parse `text` as JSON and return the parsed value plus its pretty-printed
 * representation. Throws a `SyntaxError` on invalid JSON (same as JSON.parse).
 */
export function parseAndFormat(text: string): ParseResult {
  const parsed = JSON.parse(text) as JsonValue;
  const prettyText = JSON.stringify(parsed, null, 2);
  return { parsed, prettyText };
}
