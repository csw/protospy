import { describe, expect, it } from "vitest";
import {
  formatSize,
  formatTime,
  isBulkOperation,
  matchesFilter,
  methodBadgeClass,
  methodTextClass,
  parseQueryParams,
  shortenTraceId,
  splitUri,
  statusChipClass,
  statusClass,
  statusTextClass,
  traceColor,
} from "../lib/utils";

describe("formatSize", () => {
  it("returns 0B for 0 bytes", () => {
    expect(formatSize(0)).toBe("0B");
  });

  it("returns 1B for 1 byte", () => {
    expect(formatSize(1)).toBe("1B");
  });

  it("returns 1023B at the byte/KB boundary", () => {
    expect(formatSize(1023)).toBe("1023B");
  });

  it("returns 1.0KB for exactly 1024 bytes", () => {
    expect(formatSize(1024)).toBe("1.0KB");
  });

  it("returns just under 1MB at the KB/MB boundary", () => {
    expect(formatSize(1024 * 1024 - 1)).toBe("1024.0KB");
  });

  it("returns 1.0MB for exactly 1024 * 1024 bytes", () => {
    expect(formatSize(1024 * 1024)).toBe("1.0MB");
  });

  it("formats larger MB values", () => {
    expect(formatSize(5.5 * 1024 * 1024)).toBe("5.5MB");
  });
});

describe("statusClass", () => {
  it("returns pending for undefined", () => {
    expect(statusClass(undefined)).toBe("pending");
  });

  it("returns err for non-numeric strings", () => {
    expect(statusClass("abc")).toBe("err");
  });

  it("classifies 199 as ok (under 200, code < 300)", () => {
    // The function returns "ok" for anything < 300 that's a valid number.
    expect(statusClass("199")).toBe("ok");
  });

  it("classifies 200 as ok", () => {
    expect(statusClass("200")).toBe("ok");
  });

  it("classifies 299 as ok", () => {
    expect(statusClass("299")).toBe("ok");
  });

  it("classifies 300 as redir", () => {
    expect(statusClass("300")).toBe("redir");
  });

  it("classifies 399 as redir", () => {
    expect(statusClass("399")).toBe("redir");
  });

  it("classifies 400 as cli", () => {
    expect(statusClass("400")).toBe("cli");
  });

  it("classifies 499 as cli", () => {
    expect(statusClass("499")).toBe("cli");
  });

  it("classifies 500 as srv", () => {
    expect(statusClass("500")).toBe("srv");
  });

  it("classifies 599 as srv", () => {
    expect(statusClass("599")).toBe("srv");
  });
});

describe("methodBadgeClass", () => {
  it("maps GET", () => {
    expect(methodBadgeClass("GET")).toBe("bg-m-get-bg text-m-get");
  });

  it("maps POST", () => {
    expect(methodBadgeClass("POST")).toBe("bg-m-post-bg text-m-post");
  });

  it("maps PUT", () => {
    expect(methodBadgeClass("PUT")).toBe("bg-m-put-bg text-m-put");
  });

  it("maps PATCH", () => {
    expect(methodBadgeClass("PATCH")).toBe("bg-m-patch-bg text-m-patch");
  });

  it("maps DELETE", () => {
    expect(methodBadgeClass("DELETE")).toBe("bg-m-delete-bg text-m-delete");
  });

  it("maps HEAD", () => {
    expect(methodBadgeClass("HEAD")).toBe("bg-m-head-bg text-m-head");
  });

  it("maps OPTIONS", () => {
    expect(methodBadgeClass("OPTIONS")).toBe("bg-m-opts-bg text-m-opts");
  });

  it("lowercases input still matches uppercase mapping", () => {
    expect(methodBadgeClass("get")).toBe("bg-m-get-bg text-m-get");
  });

  it("falls back for unknown methods", () => {
    expect(methodBadgeClass("CONNECT")).toBe("bg-bg-sub text-mid");
  });
});

describe("methodTextClass", () => {
  it("maps GET", () => {
    expect(methodTextClass("GET")).toBe("text-m-get");
  });

  it("maps POST", () => {
    expect(methodTextClass("POST")).toBe("text-m-post");
  });

  it("maps PUT", () => {
    expect(methodTextClass("PUT")).toBe("text-m-put");
  });

  it("maps PATCH", () => {
    expect(methodTextClass("PATCH")).toBe("text-m-patch");
  });

  it("maps DELETE", () => {
    expect(methodTextClass("DELETE")).toBe("text-m-delete");
  });

  it("maps HEAD", () => {
    expect(methodTextClass("HEAD")).toBe("text-m-head");
  });

  it("maps OPTIONS", () => {
    expect(methodTextClass("OPTIONS")).toBe("text-m-opts");
  });

  it("lowercases input still matches uppercase mapping", () => {
    expect(methodTextClass("post")).toBe("text-m-post");
  });

  it("falls back for unknown methods", () => {
    expect(methodTextClass("CONNECT")).toBe("text-mid");
  });
});

describe("statusTextClass", () => {
  it("classifies 200 as green (2xx boundary)", () => {
    expect(statusTextClass("200")).toBe("text-green");
  });

  it("classifies 299 as green", () => {
    expect(statusTextClass("299")).toBe("text-green");
  });

  it("classifies 300 as amber (3xx boundary)", () => {
    expect(statusTextClass("300")).toBe("text-amber");
  });

  it("classifies 399 as amber", () => {
    expect(statusTextClass("399")).toBe("text-amber");
  });

  it("classifies 400 as red (4xx boundary)", () => {
    expect(statusTextClass("400")).toBe("text-red");
  });

  it("classifies 500 as red", () => {
    expect(statusTextClass("500")).toBe("text-red");
  });
});

describe("statusChipClass", () => {
  it("classifies 200 as green border+text (2xx boundary)", () => {
    expect(statusChipClass("200")).toBe("border-green text-green");
  });

  it("classifies 299 as green border+text", () => {
    expect(statusChipClass("299")).toBe("border-green text-green");
  });

  it("classifies 300 as amber border+text (3xx boundary)", () => {
    expect(statusChipClass("300")).toBe("border-amber text-amber");
  });

  it("classifies 399 as amber border+text", () => {
    expect(statusChipClass("399")).toBe("border-amber text-amber");
  });

  it("classifies 400 as red border+text (4xx boundary)", () => {
    expect(statusChipClass("400")).toBe("border-red text-red");
  });

  it("classifies 500 as red border+text", () => {
    expect(statusChipClass("500")).toBe("border-red text-red");
  });
});

describe("traceColor", () => {
  it("is deterministic for the same trace ID", () => {
    const id = "abc123def456";
    expect(traceColor(id)).toBe(traceColor(id));
  });

  it("handles the empty string", () => {
    // No throw, and result is consistent between calls.
    expect(() => traceColor("")).not.toThrow();
    expect(traceColor("")).toBe(traceColor(""));
  });

  it("covers all 7 palette colors over 100 random IDs", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      // Pseudo-random hex-ish IDs.
      const id = Math.random().toString(36).slice(2) + i.toString(36);
      seen.add(traceColor(id));
    }
    expect(seen.size).toBe(7);
  });
});

describe("formatTime", () => {
  it("formats an ISO timestamp as HH:MM:SS", () => {
    expect(formatTime("2024-01-01T12:34:56Z")).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("does not throw on an invalid ISO string", () => {
    expect(() => formatTime("not-a-date")).not.toThrow();
  });
});

describe("matchesFilter", () => {
  it("returns true on empty filter", () => {
    expect(matchesFilter({ method: "GET", uri: "/", status: "200" }, "")).toBe(
      true,
    );
  });

  it("matches a method substring case-insensitively", () => {
    expect(
      matchesFilter({ method: "POST", uri: "/foo", status: "200" }, "post"),
    ).toBe(true);
    expect(
      matchesFilter({ method: "POST", uri: "/foo", status: "200" }, "POS"),
    ).toBe(true);
  });

  it("matches a URI substring", () => {
    expect(
      matchesFilter(
        { method: "GET", uri: "/api/users", status: "200" },
        "users",
      ),
    ).toBe(true);
  });

  it("matches a status substring", () => {
    expect(
      matchesFilter({ method: "GET", uri: "/", status: "404" }, "404"),
    ).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(
      matchesFilter({ method: "GET", uri: "/", status: "200" }, "zzz"),
    ).toBe(false);
  });

  it("handles an exchange with all undefined fields", () => {
    expect(matchesFilter({}, "anything")).toBe(false);
    expect(matchesFilter({}, "")).toBe(true);
  });
});

describe("splitUri", () => {
  it("returns the full path and empty query when no ?", () => {
    expect(splitUri("/foo")).toEqual({ path: "/foo", query: "" });
  });

  it("splits at the first ?", () => {
    expect(splitUri("/foo?a=1")).toEqual({ path: "/foo", query: "?a=1" });
  });

  it("handles empty input", () => {
    expect(splitUri("")).toEqual({ path: "", query: "" });
  });

  it("splits at the first ? when multiple are present", () => {
    expect(splitUri("/foo?a=1?b=2")).toEqual({
      path: "/foo",
      query: "?a=1?b=2",
    });
  });

  it("handles bare slash followed by query", () => {
    expect(splitUri("/?a=1")).toEqual({ path: "/", query: "?a=1" });
  });
});

describe("parseQueryParams", () => {
  it("returns [] when there is no ?", () => {
    expect(parseQueryParams("/foo")).toEqual([]);
  });

  it("parses a single param", () => {
    expect(parseQueryParams("/foo?a=1")).toEqual([{ key: "a", value: "1" }]);
  });

  it("parses multiple params", () => {
    expect(parseQueryParams("/foo?a=1&b=2")).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ]);
  });

  it("records duplicate keys both times", () => {
    expect(parseQueryParams("/foo?a=1&a=2")).toEqual([
      { key: "a", value: "1" },
      { key: "a", value: "2" },
    ]);
  });

  it("handles empty values", () => {
    expect(parseQueryParams("/foo?a=")).toEqual([{ key: "a", value: "" }]);
  });

  it("URL-decodes values", () => {
    // URLSearchParams decodes %20 → space.
    expect(parseQueryParams("/foo?a=%20")).toEqual([{ key: "a", value: " " }]);
  });
});

describe("shortenTraceId", () => {
  it("returns short IDs (< 8) as-is", () => {
    expect(shortenTraceId("abc")).toBe("abc");
    expect(shortenTraceId("1234567")).toBe("1234567");
  });

  it("shortens IDs of length 8", () => {
    expect(shortenTraceId("12345678")).toBe("1234…5678");
  });

  it("shortens long IDs to first4 + ellipsis + last4", () => {
    expect(shortenTraceId("abcdef1234567890abcdef")).toBe("abcd…cdef");
  });

  it("handles the empty string", () => {
    expect(shortenTraceId("")).toBe("");
  });
});

describe("isBulkOperation", () => {
  it("returns false for undefined", () => {
    expect(isBulkOperation(undefined)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isBulkOperation(null)).toBe(false);
  });

  it("recognises /_msearch", () => {
    expect(isBulkOperation("/_msearch")).toBe(true);
  });

  it("recognises /_msearch with index prefix and query string", () => {
    expect(isBulkOperation("/index/_msearch?refresh=true")).toBe(true);
  });

  it("recognises /_mget", () => {
    expect(isBulkOperation("/_mget")).toBe(true);
  });

  it("returns false for unrelated URIs", () => {
    expect(isBulkOperation("/api/users")).toBe(false);
  });
});
