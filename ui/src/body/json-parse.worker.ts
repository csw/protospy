/**
 * Web Worker script: receives a JSON text string, parses and pretty-prints it,
 * builds the JSON tree model, computes default expansion, and flattens the
 * initial visible rows. Posts all results back to the main thread so this
 * work runs off the UI thread for large bodies.
 */

import { parseAndFormat } from "./json-parse";
import { buildJsonTree } from "../components/json-tree/model";
import { computeDefaultExpanded } from "../components/json-tree/expand";
import { flattenTree, type FlatRow } from "../components/json-tree/flatten";

type InMessage = { jobId: string; text: string };
type OutMessage =
  | {
      jobId: string;
      status: "ok";
      parsed: unknown;
      prettyText: string;
      rows: FlatRow[];
      defaultExpandedIds: number[];
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
  const { jobId, text } = event.data;
  try {
    const t0 = self.performance.now();
    const { parsed, prettyText } = parseAndFormat(text);
    const workerParseMs = self.performance.now() - t0;

    const t1 = self.performance.now();
    const tree = buildJsonTree(parsed as Parameters<typeof buildJsonTree>[0]);
    const defaultExpanded = computeDefaultExpanded(tree);
    const workerTreeMs = self.performance.now() - t1;

    const t2 = self.performance.now();
    const rows = flattenTree(tree, defaultExpanded);
    const workerFlattenMs = self.performance.now() - t2;

    const out: OutMessage = {
      jobId,
      status: "ok",
      parsed,
      prettyText,
      rows,
      defaultExpandedIds: [...defaultExpanded],
      workerParseMs,
      workerTreeMs,
      workerFlattenMs,
    };
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
