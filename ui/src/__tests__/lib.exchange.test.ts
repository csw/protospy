import { describe, it, expect } from "vitest";
import type { BodyState, Exchange } from "@ui/state/types";
import {
  statusKind,
  statusCodeOnly,
  buildSizeView,
  sizeView,
  sizeText,
  responseSizeView,
  isSSEExchange,
  isMsearchExchange,
} from "@ui/lib/exchange";

function makeBody(partial: Partial<BodyState>): BodyState {
  return { chunks: [], atEnd: true, wireBytes: 0, ...partial };
}

function makeExchange(partial: Partial<Exchange>): Exchange {
  return { id: 1, timestamp: "2026-06-08T12:00:00.000Z", ...partial };
}

describe("statusKind", () => {
  it("classifies 2xx as ok", () => {
    expect(statusKind("200 OK")).toBe("ok");
    expect(statusKind("204 No Content")).toBe("ok");
  });

  it("classifies 3xx as redirect", () => {
    expect(statusKind("301 Moved Permanently")).toBe("redirect");
  });

  it("classifies 4xx as client", () => {
    expect(statusKind("404 Not Found")).toBe("client");
  });

  it("classifies 5xx as server", () => {
    expect(statusKind("503 Service Unavailable")).toBe("server");
  });

  it("treats an absent status as pending", () => {
    expect(statusKind(undefined)).toBe("pending");
  });

  it("treats a non-numeric status as error", () => {
    expect(statusKind("oops")).toBe("error");
  });

  it("lets a transport error win over any arrived status", () => {
    expect(statusKind("200 OK", true)).toBe("error");
    expect(statusKind(undefined, true)).toBe("error");
  });
});

describe("statusCodeOnly", () => {
  it("extracts the numeric code from a full status line", () => {
    expect(statusCodeOnly("200 OK")).toBe("200");
    expect(statusCodeOnly("500 Internal Server Error")).toBe("500");
  });

  it("returns the value unchanged when there is no reason phrase", () => {
    expect(statusCodeOnly("404")).toBe("404");
  });
});

describe("buildSizeView", () => {
  it("returns a fully-null view when there is no wire size", () => {
    expect(buildSizeView(null, null, undefined)).toEqual({
      wireBytes: null,
      decodedBytes: null,
      encoding: null,
      tooltip: undefined,
    });
  });

  it("reports the wire size with no decoded/encoding/tooltip when uncompressed", () => {
    expect(buildSizeView(503, undefined, undefined)).toEqual({
      wireBytes: 503,
      decodedBytes: null,
      encoding: null,
      tooltip: undefined,
    });
  });

  it("suppresses an identity content-encoding via shortEncoding", () => {
    expect(buildSizeView(100, undefined, "identity")).toEqual({
      wireBytes: 100,
      decodedBytes: null,
      encoding: null,
      tooltip: undefined,
    });
  });

  it("exposes the decoded size and a dual tooltip when it is known and differs", () => {
    expect(buildSizeView(1024, 4096, "gzip")).toEqual({
      wireBytes: 1024,
      decodedBytes: 4096,
      encoding: "gzip",
      tooltip: "1.0 KB on the wire / 4.0 KB after decompression (gzip)",
    });
  });

  it("notes the decoded size is unknown until opened when only the wire size is held", () => {
    const v = buildSizeView(1024, undefined, "br");
    expect(v.encoding).toBe("br");
    expect(v.decodedBytes).toBeNull();
    expect(v.tooltip).toBe(
      "1.0 KB on the wire (br; decoded size unknown until the body is opened)",
    );
  });

  it("omits the dual breakdown when decoded equals wire (no real compression delta)", () => {
    const v = buildSizeView(1024, 1024, "gzip");
    expect(v.decodedBytes).toBeNull();
    expect(v.tooltip).toBe(
      "1.0 KB on the wire (gzip; decoded size unknown until the body is opened)",
    );
  });
});

describe("sizeView", () => {
  it("returns a null wire size when there is no body", () => {
    expect(sizeView(undefined)).toEqual({
      wireBytes: null,
      decodedBytes: null,
      encoding: null,
      tooltip: undefined,
    });
  });

  it("reads the size facts off a BodyState", () => {
    expect(
      sizeView(
        makeBody({
          wireBytes: 1024,
          decodedBytes: 4096,
          contentEncoding: "gzip",
        }),
      ),
    ).toEqual({
      wireBytes: 1024,
      decodedBytes: 4096,
      encoding: "gzip",
      tooltip: "1.0 KB on the wire / 4.0 KB after decompression (gzip)",
    });
  });

  it("treats an identity-encoded body as uncompressed", () => {
    const v = sizeView(
      makeBody({ wireBytes: 100, contentEncoding: "identity" }),
    );
    expect(v.encoding).toBeNull();
    expect(v.tooltip).toBeUndefined();
  });
});

describe("sizeText", () => {
  it("renders an em dash when there is no body", () => {
    expect(sizeText(sizeView(undefined))).toBe("—");
  });

  it("renders the wire size alone when uncompressed", () => {
    expect(sizeText(buildSizeView(503, undefined, undefined))).toBe("503 B");
  });

  it("renders the dual wire/decoded figure when the decoded size differs", () => {
    expect(sizeText(buildSizeView(1024, 4096, "gzip"))).toBe("1.0 KB / 4.0 KB");
  });

  it("renders the wire size alone when the decoded size is unknown", () => {
    expect(sizeText(buildSizeView(1024, undefined, "br"))).toBe("1.0 KB");
  });
});

describe("responseSizeView", () => {
  it("reads the response side's body", () => {
    const ex = makeExchange({ responseBody: makeBody({ wireBytes: 256 }) });
    expect(responseSizeView(ex).wireBytes).toBe(256);
  });

  it("returns a null size when there is no response body", () => {
    expect(responseSizeView(makeExchange({})).wireBytes).toBeNull();
  });
});

describe("isSSEExchange", () => {
  it("detects an event-stream response", () => {
    const ex = makeExchange({
      responseBody: makeBody({
        contentType: "text/event-stream; charset=utf-8",
      }),
    });
    expect(isSSEExchange(ex)).toBe(true);
  });

  it("is false for a non-SSE response", () => {
    const ex = makeExchange({
      responseBody: makeBody({ contentType: "application/json" }),
    });
    expect(isSSEExchange(ex)).toBe(false);
  });

  it("is false when there is no response body", () => {
    expect(isSSEExchange(makeExchange({}))).toBe(false);
  });
});

describe("isMsearchExchange", () => {
  it("detects an _msearch URI", () => {
    expect(isMsearchExchange(makeExchange({ uri: "/index/_msearch" }))).toBe(
      true,
    );
  });

  it("detects an _mget URI", () => {
    expect(isMsearchExchange(makeExchange({ uri: "/index/_mget" }))).toBe(true);
  });

  it("is false for an ordinary URI", () => {
    expect(isMsearchExchange(makeExchange({ uri: "/index/_search" }))).toBe(
      false,
    );
  });
});
