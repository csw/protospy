import { describe, it, expect } from "vitest";
import {
  statusClass,
  statusLine,
  STATUS_REASON,
  traceTokenIndex,
  traceColorVar,
  shortTraceId,
} from "@ui/lib/tokens";

describe("statusClass", () => {
  it("returns error when hasError, regardless of status", () => {
    expect(statusClass(200, true)).toBe("error");
    expect(statusClass(null, true)).toBe("error");
  });

  it("returns pending for a null status", () => {
    expect(statusClass(null)).toBe("pending");
  });

  it("classifies by numeric range", () => {
    expect(statusClass(204)).toBe("ok");
    expect(statusClass(301)).toBe("redirect");
    expect(statusClass(404)).toBe("client");
    expect(statusClass(503)).toBe("server");
  });
});

describe("statusLine", () => {
  it("appends the known reason phrase", () => {
    expect(statusLine(404)).toBe("404 Not Found");
    expect(statusLine(200)).toBe("200 OK");
  });

  it("falls back to the bare code for an unknown status", () => {
    expect(statusLine(799)).toBe("799");
  });

  it("returns null for a null status", () => {
    expect(statusLine(null)).toBeNull();
  });

  it("exposes a reason table", () => {
    expect(STATUS_REASON[500]).toBe("Internal Server Error");
  });
});

describe("trace helpers", () => {
  it("maps a traceId to a 1-based token index in range", () => {
    for (const id of ["a", "abcd1234", "ffffffffffffffff", "trace-xyz"]) {
      const n = traceTokenIndex(id);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it("is deterministic for the same id", () => {
    expect(traceTokenIndex("abcd1234")).toBe(traceTokenIndex("abcd1234"));
  });

  it("builds a CSS var referencing the token index", () => {
    const n = traceTokenIndex("abcd1234");
    expect(traceColorVar("abcd1234")).toBe(`var(--trace-${n})`);
  });

  it("shortens a long trace id to first-4…last-4", () => {
    expect(shortTraceId("0123456789abcdef")).toBe("0123…cdef");
  });

  it("leaves a short id intact", () => {
    expect(shortTraceId("0123456789")).toBe("0123456789");
  });
});
