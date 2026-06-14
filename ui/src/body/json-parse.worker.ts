/**
 * Web Worker script: receives a JSON text string, parses and pretty-prints it,
 * and posts the result back to the main thread. Runs `JSON.parse` off the UI
 * thread so multi-MB bodies don't freeze the page.
 */

import { parseAndFormat } from "./json-parse";

type InMessage = { jobId: string; text: string };
type OutMessage =
  | {
      jobId: string;
      status: "ok";
      parsed: unknown;
      prettyText: string;
      workerParseMs: number;
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
    const out: OutMessage = {
      jobId,
      status: "ok",
      parsed,
      prettyText,
      workerParseMs,
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
