import { describe, it, expect } from "vitest";
import type { Exchange, BodyState } from "../state/types";
import {
  apply,
  evict,
  MAX_EXCHANGES,
  MAX_PAYLOAD_BYTES,
} from "../state/reducer";
import type { EventMessage } from "@bindings/EventMessage";
import type { ProxyHeaders } from "@bindings/ProxyHeaders";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExchanges() {
  return new Map<number, Exchange>();
}

function makeIds() {
  return [] as number[];
}

const BASE_META = { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" };

const CONTENT_TYPE_JSON: ProxyHeaders = [
  { name: "Content-Type", value: "application/json" },
];

const CONTENT_HEADERS: ProxyHeaders = [
  { name: "Content-Type", value: "text/plain" },
  { name: "Content-Encoding", value: "gzip" },
];

// ---------------------------------------------------------------------------
// Request event
// ---------------------------------------------------------------------------

describe("Request event", () => {
  it("creates a new exchange with correct fields", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    const msg: EventMessage = {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "Request",
        method: "GET",
        uri: "/api/movies",
        version: "HTTP/1.1",
        headers: CONTENT_TYPE_JSON,
        body: { type: "NoBody" },
      },
    };
    apply(exchanges, ids, msg);

    expect(exchanges.size).toBe(1);
    expect(ids).toEqual([1]);
    const ex = exchanges.get(1)!;
    expect(ex.id).toBe(1);
    expect(ex.timestamp).toBe("2024-01-01T00:00:00Z");
    expect(ex.method).toBe("GET");
    expect(ex.uri).toBe("/api/movies");
    expect(ex.version).toBe("HTTP/1.1");
    expect(ex.requestHeaders).toEqual(CONTENT_TYPE_JSON);
    expect(ex.requestBody).toBeUndefined();
  });

  it("sets requestBody when initial body is NotRead", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    const msg: EventMessage = {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "Request",
        method: "POST",
        uri: "/api/ingest",
        version: "HTTP/1.1",
        headers: CONTENT_HEADERS,
        body: { type: "NotRead" },
      },
    };
    apply(exchanges, ids, msg);

    const ex = exchanges.get(1)!;
    const body = ex.requestBody!;
    expect(body.chunks).toEqual([]);
    expect(body.atEnd).toBe(false);
    expect(body.wireBytes).toBe(0);
    expect(body.contentType).toBe("text/plain");
    expect(body.contentEncoding).toBe("gzip");
  });

  it("does not duplicate id if called twice for same exchange", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    const msg: EventMessage = {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "Request",
        method: "GET",
        uri: "/",
        version: "HTTP/1.1",
        headers: [],
        body: { type: "NoBody" },
      },
    };
    apply(exchanges, ids, msg);
    // A second Request for the same id (edge case)
    apply(exchanges, ids, msg);
    // ids should still have only one entry for id 1
    expect(ids.filter((id) => id === 1)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Response event
// ---------------------------------------------------------------------------

describe("Response event", () => {
  it("updates an existing exchange with response fields", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    // First a request event
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "Request",
        method: "GET",
        uri: "/",
        version: "HTTP/1.1",
        headers: [],
        body: { type: "NoBody" },
      },
    });
    // Then a response event
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "Response",
        status: "200 OK",
        version: "HTTP/1.1",
        headers: CONTENT_TYPE_JSON,
        elapsed_ms: 42,
        body: { type: "NoBody" },
      },
    });

    const ex = exchanges.get(1)!;
    expect(ex.status).toBe("200 OK");
    expect(ex.responseVersion).toBe("HTTP/1.1");
    expect(ex.responseHeaders).toEqual(CONTENT_TYPE_JSON);
    expect(ex.elapsedMs).toBe(42);
    expect(ex.responseBody).toBeUndefined();
    // Original request fields still intact
    expect(ex.method).toBe("GET");
  });

  it("creates the exchange if it does not exist yet", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "Response",
        status: "404 Not Found",
        version: "HTTP/1.1",
        headers: [],
        elapsed_ms: 5,
        body: { type: "NoBody" },
      },
    });

    expect(exchanges.size).toBe(1);
    expect(ids).toEqual([1]);
    const ex = exchanges.get(1)!;
    expect(ex.status).toBe("404 Not Found");
  });
});

// ---------------------------------------------------------------------------
// BodyData event
// ---------------------------------------------------------------------------

describe("BodyData event", () => {
  it("appends chunks to request body", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    // Request with NotRead body
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "Request",
        method: "POST",
        uri: "/upload",
        version: "HTTP/1.1",
        headers: [],
        body: { type: "NotRead" },
      },
    });
    // First chunk
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "BodyData",
        content: { offset: 0, length: 5, payload: { text: "hello" } },
        trailers: null,
        at_end: false,
        total_bytes: 5,
      },
    });
    // Second chunk
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "BodyData",
        content: { offset: 5, length: 6, payload: { text: " world" } },
        trailers: null,
        at_end: true,
        total_bytes: 11,
      },
    });

    const body = exchanges.get(1)!.requestBody!;
    expect(body.chunks).toEqual([{ text: "hello" }, { text: " world" }]);
    expect(body.atEnd).toBe(true);
    expect(body.wireBytes).toBe(11);
  });

  it("appends chunks to response body", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "Response",
        status: "200 OK",
        version: "HTTP/1.1",
        headers: [],
        elapsed_ms: 10,
        body: { type: "NotRead" },
      },
    });
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "BodyData",
        content: { offset: 0, length: 4, payload: { text: "data" } },
        trailers: null,
        at_end: false,
        total_bytes: 4,
      },
    });

    const body = exchanges.get(1)!.responseBody!;
    expect(body.chunks).toEqual([{ text: "data" }]);
    expect(body.atEnd).toBe(false);
    expect(body.wireBytes).toBe(4);
  });

  it("sets atEnd=true when at_end flag is set", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "BodyData",
        content: null,
        trailers: null,
        at_end: true,
        total_bytes: 0,
      },
    });

    const body = exchanges.get(1)!.requestBody!;
    expect(body.atEnd).toBe(true);
  });

  it("handles null content (no chunk appended)", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "BodyData",
        content: null,
        trailers: null,
        at_end: false,
        total_bytes: 0,
      },
    });

    const body = exchanges.get(1)!.requestBody!;
    expect(body.chunks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Error event
// ---------------------------------------------------------------------------

describe("Error event", () => {
  it("sets error on the exchange", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "Error",
        direction: "Request",
        message: "connection reset",
      },
    });

    const ex = exchanges.get(1)!;
    // Typed error model: single generic variant carrying direction + message
    // (PRO-346). `kind` is the discriminant for additive extension.
    expect(ex.error).toEqual({
      kind: "generic",
      direction: "Request",
      message: "connection reset",
    });
  });

  it("creates the exchange if it does not exist", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: { exchange_id: 99, timestamp: "2024-06-01T00:00:00Z" },
      direction: "Response",
      event: {
        type: "Error",
        direction: "Response",
        message: "timeout",
      },
    });

    expect(exchanges.size).toBe(1);
    expect(ids).toEqual([99]);
    expect(exchanges.get(99)!.error?.message).toBe("timeout");
    expect(exchanges.get(99)!.error?.kind).toBe("generic");
  });

  it("distinguishes a transport failure from a 5xx HTTP response", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();

    // Exchange 1: a transport/network failure — Error event, no Response.
    apply(exchanges, ids, {
      exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" },
      direction: "Response",
      event: {
        type: "Error",
        direction: "Response",
        message: "connection refused",
      },
    });

    // Exchange 2: a 5xx HTTP response that came back — Response event, no Error.
    apply(exchanges, ids, {
      exchange: { exchange_id: 2, timestamp: "2024-01-01T00:00:00Z" },
      direction: "Response",
      event: {
        type: "Response",
        status: "503 Service Unavailable",
        version: "HTTP/1.1",
        headers: [],
        elapsed_ms: 12,
        body: { type: "NoBody" },
      },
    });

    const transportFailed = exchanges.get(1)!;
    const httpError = exchanges.get(2)!;

    // Transport failure: error present, status absent.
    expect(transportFailed.error != null).toBe(true);
    expect(transportFailed.status == null).toBe(true);

    // 5xx: status present (≥ 500), error absent.
    expect(httpError.error == null).toBe(true);
    expect(httpError.status != null).toBe(true);
    expect(parseInt(httpError.status!, 10)).toBeGreaterThanOrEqual(500);
  });
});

// ---------------------------------------------------------------------------
// InitialBody variants
// ---------------------------------------------------------------------------

describe("InitialBody conversion", () => {
  it("NoBody results in undefined body state", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "Request",
        method: "GET",
        uri: "/",
        version: "HTTP/1.1",
        headers: [],
        body: { type: "NoBody" },
      },
    });
    expect(exchanges.get(1)!.requestBody).toBeUndefined();
  });

  it("Data body with content creates body state with chunk", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "Request",
        method: "POST",
        uri: "/data",
        version: "HTTP/1.1",
        headers: [{ name: "Content-Type", value: "application/octet-stream" }],
        body: {
          type: "Data",
          content: { offset: 0, length: 3, payload: { binary: "AAEC" } },
          trailers: null,
          at_end: true,
          total_bytes: 3,
        },
      },
    });

    const body = exchanges.get(1)!.requestBody as BodyState;
    expect(body.chunks).toEqual([{ binary: "AAEC" }]);
    expect(body.atEnd).toBe(true);
    expect(body.wireBytes).toBe(3);
    expect(body.contentType).toBe("application/octet-stream");
  });

  it("Data body with null content creates empty body state", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "Response",
        status: "200 OK",
        version: "HTTP/1.1",
        headers: [],
        elapsed_ms: 1,
        body: {
          type: "Data",
          content: null,
          trailers: null,
          at_end: true,
          total_bytes: 0,
        },
      },
    });

    const body = exchanges.get(1)!.responseBody as BodyState;
    expect(body.chunks).toEqual([]);
    expect(body.atEnd).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multiple exchanges
// ---------------------------------------------------------------------------

describe("Multiple exchanges", () => {
  it("maintains correct id ordering", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();

    const requestMsg = (id: number): EventMessage => ({
      exchange: { exchange_id: id, timestamp: "2024-01-01T00:00:00Z" },
      direction: "Request",
      event: {
        type: "Request",
        method: "GET",
        uri: `/${id}`,
        version: "HTTP/1.1",
        headers: [],
        body: { type: "NoBody" },
      },
    });

    apply(exchanges, ids, requestMsg(10));
    apply(exchanges, ids, requestMsg(20));
    apply(exchanges, ids, requestMsg(5));

    expect(ids).toEqual([10, 20, 5]);
    expect(exchanges.size).toBe(3);
    expect(exchanges.get(5)!.uri).toBe("/5");
  });

  it("multiple response events update correct exchanges independently", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();

    apply(exchanges, ids, {
      exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" },
      direction: "Response",
      event: {
        type: "Response",
        status: "200 OK",
        version: "HTTP/1.1",
        headers: [],
        elapsed_ms: 10,
        body: { type: "NoBody" },
      },
    });
    apply(exchanges, ids, {
      exchange: { exchange_id: 2, timestamp: "2024-01-01T00:00:00Z" },
      direction: "Response",
      event: {
        type: "Response",
        status: "500 Internal Server Error",
        version: "HTTP/1.1",
        headers: [],
        elapsed_ms: 100,
        body: { type: "NoBody" },
      },
    });

    expect(exchanges.get(1)!.status).toBe("200 OK");
    expect(exchanges.get(2)!.status).toBe("500 Internal Server Error");
  });
});

// ---------------------------------------------------------------------------
// traceparent parsing
// ---------------------------------------------------------------------------

// Helper: build a Request EventMessage with the given headers.
function requestWithHeaders(headers: ProxyHeaders): EventMessage {
  return {
    exchange: BASE_META,
    direction: "Request",
    event: {
      type: "Request",
      method: "GET",
      uri: "/",
      version: "HTTP/1.1",
      headers,
      body: { type: "NoBody" },
    },
  };
}

describe("traceparent parsing", () => {
  it("extracts traceId from a well-formed W3C traceparent", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    const traceparent =
      "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    apply(
      exchanges,
      ids,
      requestWithHeaders([{ name: "traceparent", value: traceparent }]),
    );
    expect(exchanges.get(1)!.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
  });

  it("accepts a wrong version byte and still extracts the second dash-separated field", () => {
    // Documents current behavior: the reducer does not validate the version
    // byte. It splits on "-" and takes parts[1] verbatim.
    const exchanges = makeExchanges();
    const ids = makeIds();
    const traceparent =
      "01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    apply(
      exchanges,
      ids,
      requestWithHeaders([{ name: "traceparent", value: traceparent }]),
    );
    expect(exchanges.get(1)!.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
  });

  it("extracts parts[1] from a malformed traceparent with only two dashes", () => {
    // Documents current behavior: there's no shape validation. As long as
    // there are at least two parts (one dash), parts[1] is set as the
    // traceId — even if it's clearly not 32 hex chars.
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(
      exchanges,
      ids,
      requestWithHeaders([{ name: "traceparent", value: "00-abc-def" }]),
    );
    expect(exchanges.get(1)!.traceId).toBe("abc");
  });

  it("leaves traceId unset when the traceparent has no dashes", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(
      exchanges,
      ids,
      requestWithHeaders([{ name: "traceparent", value: "no-dashes-here" }]),
    );
    // "no-dashes-here" splits to ["no", "dashes", "here"] (3 parts) — so
    // parts[1] = "dashes" is taken. Use a truly dashless value to exercise
    // the parts.length < 2 branch.
    expect(exchanges.get(1)!.traceId).toBe("dashes");

    const exchanges2 = makeExchanges();
    const ids2 = makeIds();
    apply(
      exchanges2,
      ids2,
      requestWithHeaders([{ name: "traceparent", value: "single-token" }]),
    );
    // "single-token" → 2 parts, so traceId = "token" (still set).
    expect(exchanges2.get(1)!.traceId).toBe("token");

    const exchanges3 = makeExchanges();
    const ids3 = makeIds();
    apply(
      exchanges3,
      ids3,
      requestWithHeaders([{ name: "traceparent", value: "singletoken" }]),
    );
    // No dashes at all → parts.length === 1, branch is skipped, traceId
    // stays undefined.
    expect(exchanges3.get(1)!.traceId).toBeUndefined();
  });

  it("leaves traceId unset when the traceparent header is missing", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, requestWithHeaders([]));
    expect(exchanges.get(1)!.traceId).toBeUndefined();
  });

  it("leaves traceId unset when the traceparent value is empty", () => {
    // Empty string is falsy, so the `if (tp)` guard skips parsing entirely.
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(
      exchanges,
      ids,
      requestWithHeaders([{ name: "traceparent", value: "" }]),
    );
    expect(exchanges.get(1)!.traceId).toBeUndefined();
  });

  it("preserves case verbatim — lowercase hex is kept lowercase", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    const lower = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    apply(
      exchanges,
      ids,
      requestWithHeaders([{ name: "traceparent", value: lower }]),
    );
    expect(exchanges.get(1)!.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
  });

  it("preserves case verbatim — uppercase hex is not normalised", () => {
    // Documents current behavior: traceId is stored as-typed, without case
    // normalization. The W3C spec mandates lowercase, but the reducer does
    // not enforce or coerce it.
    const exchanges = makeExchanges();
    const ids = makeIds();
    const upper = "00-0AF7651916CD43DD8448EB211C80319C-B7AD6B7169203331-01";
    apply(
      exchanges,
      ids,
      requestWithHeaders([{ name: "traceparent", value: upper }]),
    );
    expect(exchanges.get(1)!.traceId).toBe("0AF7651916CD43DD8448EB211C80319C");
  });
});

// ---------------------------------------------------------------------------
// getHeader semantics (exercised via the reducer's body.contentType / traceId)
// ---------------------------------------------------------------------------

describe("getHeader semantics", () => {
  it("matches header names case-insensitively (lowercased name still picked up)", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "Request",
        method: "POST",
        uri: "/",
        version: "HTTP/1.1",
        headers: [{ name: "content-type", value: "application/json" }],
        body: { type: "NotRead" },
      },
    });
    expect(exchanges.get(1)!.requestBody!.contentType).toBe("application/json");
  });

  it("matches header names case-insensitively (mixed-case name still picked up)", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "Request",
        method: "POST",
        uri: "/",
        version: "HTTP/1.1",
        headers: [{ name: "CoNtEnT-TyPe", value: "text/html" }],
        body: { type: "NotRead" },
      },
    });
    expect(exchanges.get(1)!.requestBody!.contentType).toBe("text/html");
  });

  it("returns the FIRST occurrence when a header appears multiple times", () => {
    // Documents current behavior: getHeader uses Array.prototype.find, which
    // returns the first matching element. If a header is duplicated (which
    // is unusual but legal for some headers), the first value wins.
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "Request",
        method: "POST",
        uri: "/",
        version: "HTTP/1.1",
        headers: [
          { name: "Content-Type", value: "first/value" },
          { name: "Content-Type", value: "second/value" },
        ],
        body: { type: "NotRead" },
      },
    });
    expect(exchanges.get(1)!.requestBody!.contentType).toBe("first/value");
  });

  it("uses the first traceparent when the header is duplicated", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    const first = "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01";
    const second = "00-cccccccccccccccccccccccccccccccc-dddddddddddddddd-01";
    apply(
      exchanges,
      ids,
      requestWithHeaders([
        { name: "traceparent", value: first },
        { name: "traceparent", value: second },
      ]),
    );
    expect(exchanges.get(1)!.traceId).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });
});

// ---------------------------------------------------------------------------
// BodyData with out-of-order content.offset
// ---------------------------------------------------------------------------

describe("BodyData ordering", () => {
  it("appends chunks in arrival order regardless of content.offset", () => {
    // Documents current behavior: the reducer does NOT sort or otherwise
    // re-order chunks by `content.offset`. The first BodyData event whose
    // payload arrives is the first chunk in `body.chunks`, even if its
    // offset says it belongs later in the stream. Downstream code (e.g.
    // body decoding) is responsible for any reassembly — the reducer just
    // accumulates.
    const exchanges = makeExchanges();
    const ids = makeIds();
    // Arrives "later" first: offset 5
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "BodyData",
        content: { offset: 5, length: 5, payload: { text: "world" } },
        trailers: null,
        at_end: false,
        total_bytes: 10,
      },
    });
    // Then "earlier" chunk: offset 0
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "BodyData",
        content: { offset: 0, length: 5, payload: { text: "hello" } },
        trailers: null,
        at_end: true,
        total_bytes: 10,
      },
    });

    const body = exchanges.get(1)!.responseBody!;
    expect(body.chunks).toEqual([{ text: "world" }, { text: "hello" }]);
    expect(body.atEnd).toBe(true);
    expect(body.wireBytes).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Response event with no elapsed_ms
// ---------------------------------------------------------------------------

describe("Response event missing elapsed_ms", () => {
  it("leaves elapsedMs undefined when the event omits elapsed_ms", () => {
    // The TS binding types `elapsed_ms` as required, but in practice the
    // reducer just copies the field through. If a malformed event arrives
    // missing `elapsed_ms`, `ex.elapsedMs` ends up undefined rather than
    // being defaulted to 0 or NaN. Cast through `unknown` to bypass the
    // binding's required-field constraint.
    const exchanges = makeExchanges();
    const ids = makeIds();
    const msg = {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "Response",
        status: "200 OK",
        version: "HTTP/1.1",
        headers: [],
        body: { type: "NoBody" },
      },
    } as unknown as EventMessage;
    apply(exchanges, ids, msg);

    const ex = exchanges.get(1)!;
    expect(ex.status).toBe("200 OK");
    expect(ex.elapsedMs).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Immutability — new object identity per event (PRO-260)
// ---------------------------------------------------------------------------

describe("immutable updates (object identity)", () => {
  function makeRequest(): EventMessage {
    return {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "Request",
        method: "POST",
        uri: "/upload",
        version: "HTTP/1.1",
        headers: [],
        body: { type: "NotRead" },
      },
    };
  }

  function bodyChunk(at_end: boolean, total_bytes: number): EventMessage {
    return {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "BodyData",
        content: { offset: 0, length: 5, payload: { text: "hello" } },
        trailers: null,
        at_end,
        total_bytes,
      },
    };
  }

  it("produces a new Exchange identity when a Response updates an existing one", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, makeRequest());
    const before = exchanges.get(1)!;

    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "Response",
        status: "200 OK",
        version: "HTTP/1.1",
        headers: [],
        elapsed_ms: 5,
        body: { type: "NoBody" },
      },
    });
    const after = exchanges.get(1)!;

    expect(after).not.toBe(before);
    // Earlier fields are carried over onto the new object.
    expect(after.method).toBe("POST");
    expect(after.status).toBe("200 OK");
  });

  it("produces a new BodyState identity (and new chunks array) on each BodyData chunk", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, makeRequest());

    apply(exchanges, ids, bodyChunk(false, 5));
    const exAfterFirst = exchanges.get(1)!;
    const bodyAfterFirst = exAfterFirst.requestBody!;
    const chunksAfterFirst = bodyAfterFirst.chunks;

    apply(exchanges, ids, bodyChunk(true, 10));
    const exAfterSecond = exchanges.get(1)!;
    const bodyAfterSecond = exAfterSecond.requestBody!;

    // The exchange, the body, and the chunks array are all new identities.
    expect(exAfterSecond).not.toBe(exAfterFirst);
    expect(bodyAfterSecond).not.toBe(bodyAfterFirst);
    expect(bodyAfterSecond.chunks).not.toBe(chunksAfterFirst);
    // The prior snapshot is not mutated retroactively.
    expect(chunksAfterFirst).toHaveLength(1);
    expect(bodyAfterFirst.atEnd).toBe(false);
    expect(bodyAfterFirst.wireBytes).toBe(5);
    // The new snapshot reflects the appended chunk.
    expect(bodyAfterSecond.chunks).toHaveLength(2);
    expect(bodyAfterSecond.atEnd).toBe(true);
    expect(bodyAfterSecond.wireBytes).toBe(10);
  });

  it("reuses the chunks array when a BodyData event carries no payload", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, makeRequest());
    apply(exchanges, ids, bodyChunk(false, 5));
    const bodyBefore = exchanges.get(1)!.requestBody!;

    // A payload-less BodyData (e.g. a terminal at_end signal) still yields a
    // new BodyState identity, but the unchanged chunks array can be shared.
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "BodyData",
        content: null,
        trailers: null,
        at_end: true,
        total_bytes: 5,
      },
    });
    const bodyAfter = exchanges.get(1)!.requestBody!;

    expect(bodyAfter).not.toBe(bodyBefore);
    expect(bodyAfter.chunks).toBe(bodyBefore.chunks);
    expect(bodyAfter.atEnd).toBe(true);
  });

  it("does not mutate a prior snapshot held across an Error event", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, makeRequest());
    const before = exchanges.get(1)!;

    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: { type: "Error", direction: "Request", message: "boom" },
    });
    const after = exchanges.get(1)!;

    expect(after).not.toBe(before);
    expect(before.error).toBeUndefined();
    expect(after.error).toEqual({
      kind: "generic",
      direction: "Request",
      message: "boom",
    });
  });
});

// ---------------------------------------------------------------------------
// Error event after a completed exchange
// ---------------------------------------------------------------------------

describe("Error event after a completed exchange", () => {
  it("sets the error and preserves all earlier request/response fields", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();

    // Full Request
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Request",
      event: {
        type: "Request",
        method: "POST",
        uri: "/api/upload",
        version: "HTTP/1.1",
        headers: [
          { name: "Content-Type", value: "application/json" },
          {
            name: "traceparent",
            value: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
          },
        ],
        body: { type: "NotRead" },
      },
    });
    // Full Response
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "Response",
        status: "200 OK",
        version: "HTTP/1.1",
        headers: CONTENT_TYPE_JSON,
        elapsed_ms: 73,
        body: {
          type: "Data",
          content: { offset: 0, length: 2, payload: { text: "ok" } },
          trailers: null,
          at_end: true,
          total_bytes: 2,
        },
      },
    });
    // Then a trailing Error event (e.g. trailer-time failure, or a late
    // signal from the proxy).
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "Error",
        direction: "Response",
        message: "stream closed unexpectedly",
      },
    });

    const ex = exchanges.get(1)!;
    expect(ex.error).toEqual({
      kind: "generic",
      direction: "Response",
      message: "stream closed unexpectedly",
    });
    // Request fields preserved.
    expect(ex.method).toBe("POST");
    expect(ex.uri).toBe("/api/upload");
    expect(ex.version).toBe("HTTP/1.1");
    expect(ex.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
    // Response fields preserved.
    expect(ex.status).toBe("200 OK");
    expect(ex.elapsedMs).toBe(73);
    expect(ex.responseBody?.chunks).toEqual([{ text: "ok" }]);
    expect(ex.responseBody?.atEnd).toBe(true);
    expect(ex.responseBody?.wireBytes).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// SSE stream support (incremental parsing via sseState)
// ---------------------------------------------------------------------------

const SSE_HEADERS: ProxyHeaders = [
  { name: "Content-Type", value: "text/event-stream" },
];

describe("SSE stream support", () => {
  it("initializes sseState on an SSE Response event with inline body", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "Response",
        status: "200 OK",
        version: "HTTP/1.1",
        headers: SSE_HEADERS,
        elapsed_ms: 10,
        body: {
          type: "Data",
          content: {
            offset: 0,
            length: 28,
            payload: { text: "event: ping\ndata: hello\n\n" },
          },
          trailers: null,
          at_end: false,
          total_bytes: 28,
        },
      },
    });

    const body = exchanges.get(1)!.responseBody!;
    expect(body.sseState).toBeDefined();
    expect(body.sseState!.events).toHaveLength(1);
    expect(body.sseState!.events[0]).toMatchObject({
      type: "ping",
      data: "hello",
      index: 0,
    });
    expect(body.sseState!.totalEventCount).toBe(1);
    // Chunks stay empty for SSE bodies
    expect(body.chunks).toEqual([]);
    expect(body.contentType).toBe("text/event-stream");
  });

  it("initializes sseState on an SSE Response with NotRead body", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "Response",
        status: "200 OK",
        version: "HTTP/1.1",
        headers: SSE_HEADERS,
        elapsed_ms: 10,
        body: { type: "NotRead" },
      },
    });

    const body = exchanges.get(1)!.responseBody!;
    expect(body.sseState).toBeDefined();
    expect(body.sseState!.events).toHaveLength(0);
    expect(body.chunks).toEqual([]);
  });

  it("feeds BodyData into sseState (not chunks) for SSE bodies", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    // SSE Response with NotRead
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "Response",
        status: "200 OK",
        version: "HTTP/1.1",
        headers: SSE_HEADERS,
        elapsed_ms: 10,
        body: { type: "NotRead" },
      },
    });

    // First BodyData chunk
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "BodyData",
        content: {
          offset: 0,
          length: 20,
          payload: { text: "data: chunk-one\n\n" },
        },
        trailers: null,
        at_end: false,
        total_bytes: 20,
      },
    });

    let body = exchanges.get(1)!.responseBody!;
    expect(body.sseState!.events).toHaveLength(1);
    expect(body.sseState!.events[0].data).toBe("chunk-one");
    expect(body.chunks).toEqual([]); // chunks still empty

    // Second BodyData chunk
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "BodyData",
        content: {
          offset: 20,
          length: 20,
          payload: { text: "data: chunk-two\n\n" },
        },
        trailers: null,
        at_end: true,
        total_bytes: 40,
      },
    });

    body = exchanges.get(1)!.responseBody!;
    expect(body.sseState!.events).toHaveLength(2);
    expect(body.sseState!.events[1].data).toBe("chunk-two");
    expect(body.sseState!.events[1].index).toBe(1);
    expect(body.sseState!.totalEventCount).toBe(2);
    expect(body.atEnd).toBe(true);
    expect(body.wireBytes).toBe(40);
    expect(body.chunks).toEqual([]);
  });

  it("does not set sseState for non-SSE responses (regression)", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "Response",
        status: "200 OK",
        version: "HTTP/1.1",
        headers: CONTENT_TYPE_JSON,
        elapsed_ms: 5,
        body: {
          type: "Data",
          content: {
            offset: 0,
            length: 2,
            payload: { text: "{}" },
          },
          trailers: null,
          at_end: true,
          total_bytes: 2,
        },
      },
    });

    const body = exchanges.get(1)!.responseBody!;
    expect(body.sseState).toBeUndefined();
    expect(body.chunks).toEqual([{ text: "{}" }]);
  });

  it("non-SSE BodyData still accumulates chunks (regression)", () => {
    const exchanges = makeExchanges();
    const ids = makeIds();
    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "Response",
        status: "200 OK",
        version: "HTTP/1.1",
        headers: CONTENT_TYPE_JSON,
        elapsed_ms: 5,
        body: { type: "NotRead" },
      },
    });

    apply(exchanges, ids, {
      exchange: BASE_META,
      direction: "Response",
      event: {
        type: "BodyData",
        content: {
          offset: 0,
          length: 4,
          payload: { text: "data" },
        },
        trailers: null,
        at_end: true,
        total_bytes: 4,
      },
    });

    const body = exchanges.get(1)!.responseBody!;
    expect(body.sseState).toBeUndefined();
    expect(body.chunks).toEqual([{ text: "data" }]);
    expect(body.atEnd).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Eviction (PRO-97): oldest-first FIFO under the count and payload caps
// ---------------------------------------------------------------------------

describe("evict", () => {
  // Seed the store directly with `n` exchanges (ids 1..n in insertion order),
  // each carrying `bytesPerExchange` of response wire payload. Bypasses `apply`
  // so the eviction logic can be exercised on hand-built state.
  function seed(n: number, bytesPerExchange = 0) {
    const exchanges = makeExchanges();
    const ids = makeIds();
    for (let id = 1; id <= n; id++) {
      const ex: Exchange = { id, timestamp: "2024-01-01T00:00:00Z" };
      if (bytesPerExchange > 0) {
        ex.responseBody = {
          chunks: [],
          atEnd: true,
          wireBytes: bytesPerExchange,
        };
      }
      exchanges.set(id, ex);
      ids.push(id);
    }
    return { exchanges, ids };
  }

  it("is a no-op when both caps are satisfied", () => {
    const { exchanges, ids } = seed(10, 1000);
    evict(exchanges, ids);
    expect(ids).toHaveLength(10);
    expect(exchanges.size).toBe(10);
    expect(ids[0]).toBe(1);
  });

  it("drops oldest exchanges down to the count cap", () => {
    const { exchanges, ids } = seed(MAX_EXCHANGES + 5);
    evict(exchanges, ids);

    expect(ids).toHaveLength(MAX_EXCHANGES);
    expect(exchanges.size).toBe(MAX_EXCHANGES);
    // The 5 oldest (ids 1..5) were evicted; the newest is retained.
    expect(exchanges.has(1)).toBe(false);
    expect(exchanges.has(5)).toBe(false);
    expect(exchanges.has(6)).toBe(true);
    expect(ids[0]).toBe(6);
    expect(ids[ids.length - 1]).toBe(MAX_EXCHANGES + 5);
  });

  it("drops oldest exchanges until under the payload cap", () => {
    // 4 exchanges each holding 200 MB → 800 MB total, over the 512 MB cap.
    // Evicting the two oldest leaves 400 MB across ids 3 and 4.
    const bytes = 200 * 1024 * 1024;
    const { exchanges, ids } = seed(4, bytes);
    expect(4 * bytes).toBeGreaterThan(MAX_PAYLOAD_BYTES);

    evict(exchanges, ids);

    expect(ids).toEqual([3, 4]);
    expect(exchanges.has(1)).toBe(false);
    expect(exchanges.has(2)).toBe(false);
  });

  it("counts both request and response body bytes", () => {
    const half = 300 * 1024 * 1024;
    const exchanges = makeExchanges();
    const ids = makeIds();
    for (let id = 1; id <= 2; id++) {
      exchanges.set(id, {
        id,
        timestamp: "2024-01-01T00:00:00Z",
        requestBody: { chunks: [], atEnd: true, wireBytes: half },
        responseBody: { chunks: [], atEnd: true, wireBytes: half },
      });
      ids.push(id);
    }
    // Each exchange is 600 MB on its own → over the cap even singly.
    evict(exchanges, ids);
    // Oldest dropped; newest retained (store never empties — see below).
    expect(ids).toEqual([2]);
  });

  it("never evicts the currently selected exchange (count cap)", () => {
    const { exchanges, ids } = seed(MAX_EXCHANGES + 3);
    // Select the oldest exchange — it must survive eviction.
    evict(exchanges, ids, 1);

    expect(ids).toHaveLength(MAX_EXCHANGES);
    expect(exchanges.has(1)).toBe(true);
    // The next-oldest non-selected ids absorbed the eviction instead.
    expect(exchanges.has(2)).toBe(false);
    expect(exchanges.has(3)).toBe(false);
    expect(exchanges.has(4)).toBe(false);
    expect(ids[0]).toBe(1);
  });

  it("never evicts the currently selected exchange (payload cap)", () => {
    const bytes = 200 * 1024 * 1024; // 4 × 200 MB = 800 MB
    const { exchanges, ids } = seed(4, bytes);
    // Select the oldest; it is retained while the next-oldest is dropped.
    evict(exchanges, ids, 1);

    expect(exchanges.has(1)).toBe(true);
    expect(exchanges.has(2)).toBe(false);
    // Total back under cap: id 1 (selected) + the newest survivors.
    let total = 0;
    for (const id of ids) total += exchanges.get(id)!.responseBody!.wireBytes;
    expect(total).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
  });

  it("keeps at least one exchange even if it alone exceeds the payload cap", () => {
    const bytes = MAX_PAYLOAD_BYTES + 1;
    const { exchanges, ids } = seed(1, bytes);
    evict(exchanges, ids);
    expect(ids).toEqual([1]);
    expect(exchanges.size).toBe(1);
  });
});
