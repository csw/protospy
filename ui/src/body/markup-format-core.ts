/**
 * Pure markup pretty-print + tokenization core (PRO-414). No DOM, no React, no
 * Worker globals — imported by both the Web Worker (`markup-format.worker.ts`)
 * and the Node-environment unit tests.
 *
 * Two stages, mirroring the JSON pipeline's parse→flatten split:
 *
 * 1. `prettyPrintMarkup(text, kind)` — re-indents minified HTML/XML so the
 *    formatted view has real lines. This is a *prerequisite* for line-level
 *    virtualization: a minified body is a single multi-MB line, which both
 *    defeats virtualization and chokes the DOM. XML uses `xml-formatter`; HTML
 *    uses `js-beautify` — both pure-JS (no `DOMParser`, which is unavailable in
 *    Workers) and O(scan) rather than full AST reprints, so they stay fast on
 *    the multi-MB bodies the ticket calls out.
 * 2. `tokenizeMarkup(text)` — Prism's `markup` grammar (covers HTML, XML, SVG,
 *    and every XML dialect: SOAP/RSS/Atom) tokenizes the text, then we flatten
 *    the token stream into **per-line** token arrays. Per-line output is what
 *    lets the view virtualize: render only the visible lines' tokens.
 */

// Import order matters: prism-setup configures Prism before prismjs initializes.
import "./prism-setup";
import Prism from "prismjs";
import xmlFormat from "xml-formatter";
import beautify from "js-beautify";

/** Which markup grammar a body is — drives the pretty-printer choice. */
export type MarkupKind = "html" | "xml";

/**
 * One highlighted run of text within a line. `type` is the Prism token type
 * (e.g. `tag`, `attr-name`, `attr-value`, `comment`, `punctuation`, `entity`)
 * or `""` for un-highlighted text. The view maps `type` to a color class.
 */
export interface MarkupToken {
  type: string;
  text: string;
}

/** A single rendered line: its tokens in order. An empty array is a blank line. */
export type MarkupLine = MarkupToken[];

/**
 * Re-indent a minified/compact markup body. Returns the original text unchanged
 * if the formatter throws (malformed XML, etc.) — highlighting still applies, we
 * just don't re-indent. Never throws.
 */
export function prettyPrintMarkup(text: string, kind: MarkupKind): string {
  try {
    if (kind === "xml") {
      return xmlFormat(text, {
        indentation: "  ",
        collapseContent: true,
        lineSeparator: "\n",
        whiteSpaceAtEndOfSelfclosingTag: true,
      });
    }
    return beautify.html(text, {
      indent_size: 2,
      end_with_newline: false,
      // Don't reflow text runs — keep an inspection-faithful view.
      wrap_line_length: 0,
      preserve_newlines: true,
      max_preserve_newlines: 2,
    });
  } catch {
    return text;
  }
}

/** Append `text` (which may contain newlines) to `lines`, splitting on `\n`. */
function pushText(lines: MarkupLine[], type: string, text: string): void {
  const parts = text.split("\n");
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) lines.push([]);
    if (parts[i] !== "") lines[lines.length - 1].push({ type, text: parts[i] });
  }
}

/**
 * Walk a Prism token (string | Token | nested), emitting flat tokens into
 * `lines`. The innermost token type wins, so leaf text carries its specific
 * type (e.g. an `attr-name` nested inside a `tag`).
 */
function walk(
  lines: MarkupLine[],
  node: string | Prism.Token,
  inheritedType: string,
): void {
  if (typeof node === "string") {
    pushText(lines, inheritedType, node);
    return;
  }
  const type = node.type || inheritedType;
  const content = node.content;
  if (typeof content === "string") {
    pushText(lines, type, content);
  } else if (Array.isArray(content)) {
    for (const child of content) walk(lines, child, type);
  } else {
    walk(lines, content, type);
  }
}

/**
 * Tokenize markup `text` into per-line token arrays using Prism's `markup`
 * grammar. Always returns at least one (possibly empty) line.
 */
export function tokenizeMarkup(text: string): MarkupLine[] {
  const tokens = Prism.tokenize(text, Prism.languages.markup);
  const lines: MarkupLine[] = [[]];
  for (const token of tokens) walk(lines, token, "");
  return lines;
}
