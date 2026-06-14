/**
 * Client side of the JSON-parse Web Worker. Exposes `parseJson(text)` —
 * an async wrapper that offloads JSON parse + tree build + initial flatten
 * to a dedicated Worker so the UI thread stays responsive with large bodies.
 *
 * The Worker is a lazy singleton: created on the first call and reused for all
 * subsequent calls, avoiding cold-start overhead per parse.
 */

import type { FlatRow } from "../components/json-tree/flatten";

/** What `parseJson()` resolves with. */
export interface JsonParseResult {
  /** The parsed JavaScript value. Available for lazy tree rebuild on expand/collapse. */
  parsed: unknown;
  /** The original value re-serialised with 2-space indentation. */
  prettyText: string;
  /** Pre-built flat rows for the initial render (avoids main-thread tree build). */
  rows: FlatRow[];
  /** Which node IDs are expanded in the initial render. */
  defaultExpanded: ReadonlySet<number>;
}

type OutMessage =
  | {
      jobId: string;
      status: "ok";
      parsed: unknown;
      prettyText: string;
      rows: FlatRow[];
      defaultExpandedIds: number[];
      workerParseMs: number;
    }
  | { jobId: string; status: "error"; message: string };

type PendingJob = {
  resolve: (result: JsonParseResult) => void;
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
      job.resolve({
        parsed: msg.parsed,
        prettyText: msg.prettyText,
        rows: msg.rows,
        defaultExpanded: new Set(msg.defaultExpandedIds),
      });
    } else {
      job.reject(new SyntaxError(msg.message));
    }
  });

  _worker.addEventListener("error", (event) => {
    // Fatal worker error — reset first so a fresh worker can be created on
    // the next call, then reject all in-flight jobs.
    _worker = null;
    const err = new Error(event.message ?? "JSON parse worker error");
    for (const [jobId, job] of _pending) {
      _pending.delete(jobId);
      job.reject(err);
    }
  });

  return _worker;
}

/**
 * Parse `text` as JSON in a Web Worker and return the parsed value, its
 * pretty-printed form, pre-built initial flat rows, and the default expanded
 * set. Rejects with a `SyntaxError` on invalid JSON.
 */
export function parseJson(text: string): Promise<JsonParseResult> {
  return new Promise<JsonParseResult>((resolve, reject) => {
    const jobId = String(_jobCounter++);
    let worker: Worker;
    try {
      worker = getWorker();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    _pending.set(jobId, { resolve, reject, startMs: performance.now() });
    worker.postMessage({ jobId, text });
  });
}
