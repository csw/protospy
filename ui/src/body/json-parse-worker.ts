/**
 * Client side of the JSON-parse Web Worker. Exposes `parseJson(text)` —
 * an async wrapper that offloads `JSON.parse` + `JSON.stringify` to a
 * dedicated Worker so the UI thread stays responsive while parsing large bodies.
 *
 * The Worker is a lazy singleton: created on the first call and reused for all
 * subsequent calls, avoiding cold-start overhead per parse.
 */

import type { ParseResult } from "./json-parse";

type OutMessage =
  | {
      jobId: string;
      status: "ok";
      parsed: unknown;
      prettyText: string;
      workerParseMs: number;
    }
  | { jobId: string; status: "error"; message: string };

type PendingJob = {
  resolve: (result: ParseResult) => void;
  reject: (err: Error) => void;
  startMs: number;
};

let _worker: Worker | null = null;
let _jobCounter = 0;
const _pending = new Map<string, PendingJob>();

function getWorker(): Worker {
  if (_worker) return _worker;

  _worker = new Worker(new URL("./json-parse.worker.ts", import.meta.url), {
    type: "module",
  });

  _worker.addEventListener("message", (event: MessageEvent<OutMessage>) => {
    const msg = event.data;
    const job = _pending.get(msg.jobId);
    if (!job) return;
    _pending.delete(msg.jobId);
    if (msg.status === "ok") {
      const roundTripMs = performance.now() - job.startMs;
      performance.measure("json-worker-roundtrip", {
        start: job.startMs,
        duration: roundTripMs,
        detail: {
          workerParseMs: msg.workerParseMs,
          transferMs: roundTripMs - msg.workerParseMs,
        },
      });
      job.resolve({ parsed: msg.parsed, prettyText: msg.prettyText });
    } else {
      job.reject(new Error(msg.message));
    }
  });

  _worker.addEventListener("error", (event) => {
    // Fatal worker error — reject all in-flight jobs.
    const err = new Error(event.message ?? "JSON parse worker error");
    for (const [jobId, job] of _pending) {
      _pending.delete(jobId);
      job.reject(err);
    }
    // Allow a fresh worker to be created on the next call.
    _worker = null;
  });

  return _worker;
}

/**
 * Parse `text` as JSON and return the parsed value plus its 2-space
 * pretty-printed form, running `JSON.parse` in a Web Worker.
 *
 * Rejects with a `SyntaxError` when the input is not valid JSON (same
 * semantics as a synchronous `JSON.parse` throw).
 */
export function parseJson(text: string): Promise<ParseResult> {
  return new Promise<ParseResult>((resolve, reject) => {
    const jobId = String(_jobCounter++);
    _pending.set(jobId, { resolve, reject, startMs: performance.now() });
    getWorker().postMessage({ jobId, text });
  });
}
