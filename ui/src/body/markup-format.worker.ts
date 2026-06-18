/**
 * Web Worker script: receives an HTML/XML body, pretty-prints it (re-indent),
 * then tokenizes it into per-line highlight tokens with Prism. Both stages are
 * CPU-heavy on multi-MB bodies (SOAP, RSS, data exports), so they run off the
 * UI thread — mirroring the JSON-parse Worker (`json-parse.worker.ts`).
 *
 * The formatted text is returned alongside the line tokens so the formatted
 * view's copy action and the line model share one source.
 */

import {
  prettyPrintMarkup,
  tokenizeMarkup,
  type MarkupKind,
  type MarkupLine,
} from "./markup-format-core";

type InMessage = { jobId: string; text: string; kind: MarkupKind };
type OutMessage =
  | {
      jobId: string;
      status: "ok";
      lines: MarkupLine[];
      formattedText: string;
      workerFormatMs: number;
      workerTokenizeMs: number;
    }
  | { jobId: string; status: "error"; message: string };

// The shared tsconfig uses the DOM lib, which types `self` as Window. In a
// module Worker `self` is DedicatedWorkerGlobalScope, whose postMessage takes
// only the message. Cast through unknown — same shim as the JSON Worker.
type WorkerGlobal = { postMessage(msg: unknown): void };
const workerSelf = self as unknown as WorkerGlobal;

self.addEventListener("message", (event: MessageEvent<InMessage>) => {
  const { jobId, text, kind } = event.data;
  try {
    const t0 = self.performance.now();
    const formattedText = prettyPrintMarkup(text, kind);
    const workerFormatMs = self.performance.now() - t0;

    const t1 = self.performance.now();
    const lines = tokenizeMarkup(formattedText);
    const workerTokenizeMs = self.performance.now() - t1;

    const out: OutMessage = {
      jobId,
      status: "ok",
      lines,
      formattedText,
      workerFormatMs,
      workerTokenizeMs,
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
