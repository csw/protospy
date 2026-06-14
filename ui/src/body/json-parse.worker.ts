/**
 * Web Worker script: receives a JSON or NDJSON text string, parses it (tolerating
 * a truncated tail), builds the tree model(s), computes default expansion, and
 * flattens the initial visible rows. Posts all results back to the main thread so
 * this work runs off the UI thread for large bodies.
 *
 * Two modes (phase 3, PRO-400):
 * - `"json"`   — a single document; a truncated body is recovered to its valid
 *   prefix and its cut point marked.
 * - `"ndjson"` — one document per line, rendered as a forest of independently
 *   collapsible trees in one combined, virtualized row list.
 */

import { parseWithTruncation, parseNdjson } from "./json-parse-core";
import {
  buildJsonTree,
  buildJsonForest,
  markTruncationPoint,
  type JsonValue,
} from "../components/json-tree/model";
import {
  computeDefaultExpanded,
  computeForestDefaultExpanded,
} from "../components/json-tree/expand";
import {
  flattenTree,
  flattenForest,
  type FlatRow,
} from "../components/json-tree/flatten";

type ParseMode = "json" | "ndjson";
type InMessage = { jobId: string; text: string; mode: ParseMode };
type OutMessage =
  | {
      jobId: string;
      status: "ok";
      mode: ParseMode;
      /** Single-document JSON value (mode `"json"`); `null` for NDJSON. */
      parsed: JsonValue | null;
      /** Per-line documents (mode `"ndjson"`); `null` for single JSON. */
      documents: JsonValue[] | null;
      prettyText: string;
      rows: FlatRow[];
      defaultExpandedIds: number[];
      /** True when a truncated valid-prefix was recovered. */
      truncated: boolean;
      workerParseMs: number;
      workerTreeMs: number;
      workerFlattenMs: number;
    }
  | { jobId: string; status: "error"; message: string };

// The tsconfig uses the DOM lib, which types `self` as Window. In a Worker
// module `self` is DedicatedWorkerGlobalScope, whose postMessage takes only
// the message (no targetOrigin). Cast through unknown to reflect reality
// without requiring the WebWorker lib in the shared tsconfig.
type WorkerGlobal = { postMessage(msg: unknown): void };
const workerSelf = self as unknown as WorkerGlobal;

self.addEventListener("message", (event: MessageEvent<InMessage>) => {
  const { jobId, text, mode } = event.data;
  try {
    const out =
      mode === "ndjson" ? buildNdjson(jobId, text) : buildJson(jobId, text);
    workerSelf.postMessage(out);
  } catch (e) {
    const out: OutMessage = {
      jobId,
      status: "error",
      message: e instanceof Error ? e.message : String(e),
    };
    workerSelf.postMessage(out);
  }
});

/** Build the response for a single JSON document (truncation-tolerant). */
function buildJson(jobId: string, text: string): OutMessage {
  const t0 = self.performance.now();
  const { parsed, prettyText, truncated } = parseWithTruncation(text);
  const workerParseMs = self.performance.now() - t0;

  const t1 = self.performance.now();
  const tree = buildJsonTree(parsed);
  const defaultExpanded = computeDefaultExpanded(tree);
  if (truncated) {
    // Expand the path to the cut point so the in-tree marker is visible.
    for (const id of markTruncationPoint(tree).ancestorIds) {
      defaultExpanded.add(id);
    }
  }
  const workerTreeMs = self.performance.now() - t1;

  const t2 = self.performance.now();
  const rows = flattenTree(tree, defaultExpanded);
  const workerFlattenMs = self.performance.now() - t2;

  return {
    jobId,
    status: "ok",
    mode: "json",
    parsed,
    documents: null,
    prettyText,
    rows,
    defaultExpandedIds: [...defaultExpanded],
    truncated,
    workerParseMs,
    workerTreeMs,
    workerFlattenMs,
  };
}

/** Build the response for an NDJSON/JSONL body (forest of documents). */
function buildNdjson(jobId: string, text: string): OutMessage {
  const t0 = self.performance.now();
  const { documents, truncatedDocIndex } = parseNdjson(text);
  if (documents.length === 0) {
    throw new SyntaxError("no NDJSON documents");
  }
  const workerParseMs = self.performance.now() - t0;

  const t1 = self.performance.now();
  const roots = buildJsonForest(documents);
  const defaultExpanded = computeForestDefaultExpanded(roots);
  if (truncatedDocIndex != null) {
    // Re-expand the truncated document (and its rightmost path) so its cut-point
    // marker is visible without the user having to open that document.
    for (const id of markTruncationPoint(roots[truncatedDocIndex])
      .ancestorIds) {
      defaultExpanded.add(id);
    }
  }
  const workerTreeMs = self.performance.now() - t1;

  const t2 = self.performance.now();
  const rows = flattenForest(roots, defaultExpanded);
  const workerFlattenMs = self.performance.now() - t2;

  // Copyable text: each document pretty-printed, blank-line separated.
  const prettyText = documents
    .map((doc) => JSON.stringify(doc, null, 2))
    .join("\n\n");

  return {
    jobId,
    status: "ok",
    mode: "ndjson",
    parsed: null,
    documents,
    prettyText,
    rows,
    defaultExpandedIds: [...defaultExpanded],
    truncated: truncatedDocIndex != null,
    workerParseMs,
    workerTreeMs,
    workerFlattenMs,
  };
}
