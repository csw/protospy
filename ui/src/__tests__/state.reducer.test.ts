import { describe, it, expect } from "vitest";
import type { Exchange, BodyState } from "../state/reducer";
import { apply } from "../state/reducer";
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
    expect(body.totalBytes).toBe(0);
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
    expect(body.totalBytes).toBe(11);
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
    expect(body.totalBytes).toBe(4);
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
    expect(ex.error).toEqual({
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
    expect(body.totalBytes).toBe(3);
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
