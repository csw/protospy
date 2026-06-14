/**
 * Client side of the JSON-parse Web Worker. Exposes `parseJson(text)` —
 * an async wrapper that offloads JSON parse + tree build + initial flatten
 * to a dedicated Worker so the UI thread stays responsive with large bodies.
 *
 * The Worker is a lazy singleton: created on the first call and reused for all
 * subsequent calls, avoiding cold-start overhead per parse.
 */

import type { JsonValue } from "../components/json-tree/model";
import type { FlatRow } from "../components/json-tree/flatten";

type ParseMode = "json" | "ndjson";

/** What `parseJson()` / `parseNdjson()` resolve with. */
export interface JsonParseResult {
  /**
   * The parsed JavaScript value for single-document JSON, available for lazy tree
   * rebuild on expand/collapse. `null` for NDJSON (see `documents`).
   */
  parsed: JsonValue | null;
  /**
   * The per-line documents for an NDJSON/JSONL body, available for lazy forest
   * rebuild on interaction. `null` for single-document JSON (see `parsed`).
   */
  documents: JsonValue[] | null;
  /** The original value re-serialised with 2-space indentation. */
  prettyText: string;
  /** Pre-built flat rows for the initial render (avoids main-thread tree build). */
  rows: FlatRow[];
  /** Which node IDs are expanded in the initial render. */
  defaultExpanded: ReadonlySet<number>;
  /** True when a truncated valid-prefix was recovered (drives the banner/marker). */
  truncated: boolean;
}

type OutMessage =
  | {
      jobId: string;
      status: "ok";
      mode: ParseMode;
      parsed: JsonValue | null;
      documents: JsonValue[] | null;
      prettyText: string;
      rows: FlatRow[];
      defaultExpandedIds: number[];
      truncated: boolean;
      workerParseMs: number;
      workerTreeMs: number;
      workerFlattenMs: number;
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
      const workerTotalMs =
        msg.workerParseMs + msg.workerTreeMs + msg.workerFlattenMs;
      performance.measure("json-worker-roundtrip", {
        start: job.startMs,
        duration: roundTripMs,
        detail: {
          workerParseMs: msg.workerParseMs,
          workerTreeMs: msg.workerTreeMs,
          workerFlattenMs: msg.workerFlattenMs,
          transferMs: roundTripMs - workerTotalMs,
        },
      });
      job.resolve({
        parsed: msg.parsed,
        documents: msg.documents,
        prettyText: msg.prettyText,
        rows: msg.rows,
        defaultExpanded: new Set(msg.defaultExpandedIds),
        truncated: msg.truncated,
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

function runJob(text: string, mode: ParseMode): Promise<JsonParseResult> {
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
    try {
      worker.postMessage({ jobId, text, mode });
    } catch (e) {
      _pending.delete(jobId);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/**
 * Parse `text` as a single JSON document in a Web Worker and return the parsed
 * value, its pretty-printed form, pre-built initial flat rows, the default
 * expanded set, and whether a truncated prefix was recovered. Rejects with a
 * `SyntaxError` only when no valid prefix could be recovered.
 */
export function parseJson(text: string): Promise<JsonParseResult> {
  return runJob(text, "json");
}

/**
 * Parse `text` as an NDJSON/JSONL body (one document per line) in a Web Worker,
 * returning the per-line `documents`, pre-built combined forest rows, the default
 * expanded set, and whether the final document was truncated. Rejects when no
 * documents could be parsed.
 */
export function parseNdjson(text: string): Promise<JsonParseResult> {
  return runJob(text, "ndjson");
}
