/**
 * Pure JSON parse-and-format logic. Extracted here so the Worker script can
 * import it and so unit tests can exercise it in the Node environment without
 * a real Worker.
 */

export interface ParseResult {
  /** The parsed JavaScript value. Transferred to the main thread via structured-clone. */
  parsed: unknown;
  /** The original value re-serialised with 2-space indentation. */
  prettyText: string;
}

/**
 * Parse `text` as JSON and return the parsed value plus its pretty-printed
 * representation. Throws a `SyntaxError` on invalid JSON (same as JSON.parse).
 */
export function parseAndFormat(text: string): ParseResult {
  const parsed: unknown = JSON.parse(text);
  const prettyText = JSON.stringify(parsed, null, 2);
  return { parsed, prettyText };
}
