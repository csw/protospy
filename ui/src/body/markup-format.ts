/**
 * Client side of the markup-format Web Worker (PRO-414). Exposes
 * `formatMarkup(text, kind)` — an async wrapper that offloads pretty-print +
 * Prism tokenization to a dedicated Worker so the UI thread stays responsive on
 * multi-MB HTML/XML bodies. Mirrors `json-parse.ts`: a lazy-singleton Worker
 * with job-ID message routing, reset on fatal error.
 */

import type { MarkupKind, MarkupLine } from "./markup-format-core";

/** What `formatMarkup()` resolves with. */
export interface MarkupFormatResult {
  /** Per-line highlight tokens for the virtualized formatted view. */
  lines: MarkupLine[];
  /** The re-indented markup text (backs the formatted-view copy action). */
  formattedText: string;
}

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

type PendingJob = {
  resolve: (result: MarkupFormatResult) => void;
  reject: (err: Error) => void;
  startMs: number;
};

let _worker: Worker | null = null;
let _jobCounter = 0;
const _pending = new Map<string, PendingJob>();

function getWorker(): Worker {
  if (_worker) return _worker;

  _worker = new Worker(new URL("./markup-format.worker.ts", import.meta.url), {
    type: "module",
  });

  _worker.addEventListener("message", (event: MessageEvent<OutMessage>) => {
    const msg = event.data;
    const job = _pending.get(msg.jobId);
    if (!job) return;
    _pending.delete(msg.jobId);
    if (msg.status === "ok") {
      const roundTripMs = performance.now() - job.startMs;
      performance.measure("markup-worker-roundtrip", {
        start: job.startMs,
        duration: roundTripMs,
        detail: {
          workerFormatMs: msg.workerFormatMs,
          workerTokenizeMs: msg.workerTokenizeMs,
          transferMs: roundTripMs - msg.workerFormatMs - msg.workerTokenizeMs,
        },
      });
      job.resolve({ lines: msg.lines, formattedText: msg.formattedText });
    } else {
      job.reject(new Error(msg.message));
    }
  });

  _worker.addEventListener("error", (event) => {
    // Fatal worker error — reset first so a fresh worker can be created on the
    // next call, then reject all in-flight jobs.
    _worker = null;
    const err = new Error(event.message ?? "markup format worker error");
    for (const [jobId, job] of _pending) {
      _pending.delete(jobId);
      job.reject(err);
    }
  });

  return _worker;
}

/**
 * Pretty-print and tokenize `text` as HTML or XML in a Web Worker, returning the
 * per-line highlight tokens and the re-indented text. Rejects only on a fatal
 * worker error — a malformed body is recovered by the core (highlight without
 * re-indent), not rejected.
 */
export function formatMarkup(
  text: string,
  kind: MarkupKind,
): Promise<MarkupFormatResult> {
  return new Promise<MarkupFormatResult>((resolve, reject) => {
    const jobId = String(_jobCounter++);
    let worker: Worker;
    try {
      worker = getWorker();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    _pending.set(jobId, { resolve, reject, startMs: performance.now() });
    try {
      worker.postMessage({ jobId, text, kind });
    } catch (e) {
      _pending.delete(jobId);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
