/**
 * Pure JSON parse-and-format logic. Imported by the Worker script and by unit
 * tests that need to exercise it in the Node environment without a real Worker.
 */

import {
  parse as bestEffortParse,
  disableErrorLogging,
} from "best-effort-json-parser";
import type { JsonValue } from "../components/json-tree/model";

// best-effort-json-parser logs recovered-prefix details to the console by
// default. We expect and handle recovery explicitly, so silence its logging to
// keep the console clean (a no-new-console-errors requirement of the DoD).
disableErrorLogging();

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

export interface TruncatableParseResult extends ParseResult {
  /**
   * True when strict `JSON.parse` failed but a valid structural prefix was
   * recovered — i.e. the body was truncated (a size cap or interrupted capture)
   * or otherwise cut off. Drives the truncation banner and in-tree marker.
   */
  truncated: boolean;
}

/**
 * Parse `text`, tolerating a truncated tail (phase 3, PRO-400).
 *
 * Tries strict `JSON.parse` first (the common, complete-body case). On failure,
 * falls back to `best-effort-json-parser`, which recovers the valid prefix of a
 * truncated document. Recovery is accepted only when it yields a *structural*
 * value (object or array): a lone recovered primitive (or garbage) is too weak a
 * signal to present as a tree, so we throw and let the caller fall through to the
 * raw text view. The recovered value's deepest rightmost node is the truncation
 * point — see {@link markTruncationPoint}.
 */
export function parseWithTruncation(text: string): TruncatableParseResult {
  try {
    return { ...parseAndFormat(text), truncated: false };
  } catch (strictError) {
    const recovered = bestEffortParse(text) as JsonValue;
    if (
      recovered === null ||
      typeof recovered !== "object" // primitive — not a confident structural recovery
    ) {
      // Re-throw the strict error so the caller treats it as plain text.
      throw strictError instanceof Error
        ? strictError
        : new SyntaxError(String(strictError));
    }
    return {
      parsed: recovered,
      prettyText: JSON.stringify(recovered, null, 2),
      truncated: true,
    };
  }
}

export interface NdjsonParseResult {
  /** One parsed value per non-blank line, in document order. */
  documents: JsonValue[];
  /**
   * Index of the document recovered from a truncated final line, or `null` when
   * the body parsed cleanly. NDJSON truncation is line-granular: complete lines
   * parse strictly and only the last line can be cut mid-document.
   */
  truncatedDocIndex: number | null;
}

/**
 * Parse an NDJSON/JSONL body into one value per line (phase 3, PRO-400).
 *
 * Blank lines (the trailing newline NDJSON conventionally ends with, and any
 * separators) are ignored. Each complete line is parsed strictly; only the final
 * line is allowed to be truncated, in which case its valid prefix is recovered
 * via {@link parseWithTruncation} and its index returned as `truncatedDocIndex`.
 * A non-final line that fails to parse is skipped defensively (well-formed NDJSON
 * has one valid document per line).
 */
export function parseNdjson(text: string): NdjsonParseResult {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  const documents: JsonValue[] = [];
  let truncatedDocIndex: number | null = null;

  lines.forEach((line, i) => {
    const isLast = i === lines.length - 1;
    try {
      documents.push(JSON.parse(line) as JsonValue);
    } catch {
      if (!isLast) return; // skip a malformed interior line
      try {
        const { parsed } = parseWithTruncation(line);
        documents.push(parsed);
        truncatedDocIndex = documents.length - 1;
      } catch {
        // Final line could not be recovered even as a prefix — drop it.
      }
    }
  });

  return { documents, truncatedDocIndex };
}
