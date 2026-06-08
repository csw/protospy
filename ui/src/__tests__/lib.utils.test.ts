import { describe, expect, it } from "vitest";
import {
  cn,
  decodeBasicAuth,
  eventTypeBadgeClass,
  filterHeaders,
  formatAbsoluteTime,
  formatRelative,
  formatSize,
  formatSizeShort,
  formatTime,
  isBulkOperation,
  maskHeaderValue,
  matchesFilter,
  methodBadgeClass,
  methodTextClass,
  parseQueryParams,
  shortEncoding,
  shortenTraceId,
  sortHeadersByPin,
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

describe("formatSizeShort", () => {
  it("shows bytes with a spaced unit and no decimal", () => {
    expect(formatSizeShort(0)).toBe("0 B");
    expect(formatSizeShort(58)).toBe("58 B");
    expect(formatSizeShort(1023)).toBe("1023 B");
  });

  it("scales to KB / MB with one decimal and a space", () => {
    expect(formatSizeShort(1024)).toBe("1.0 KB");
    expect(formatSizeShort(1536)).toBe("1.5 KB");
    expect(formatSizeShort(1024 * 1024)).toBe("1.0 MB");
    expect(formatSizeShort(5.5 * 1024 * 1024)).toBe("5.5 MB");
  });

  it("rolls up to the next unit when rounding tips to 1024", () => {
    // Just under 1 MB: 1023.999… KB must print "1.0 MB", not "1024.0 KB".
    expect(formatSizeShort(1024 * 1024 - 1)).toBe("1.0 MB");
    // Same boundary one unit up: just under 1 GB.
    expect(formatSizeShort(1024 ** 3 - 1)).toBe("1.0 GB");
  });

  it("scales through GB and TB so the width stays bounded", () => {
    // Unlike formatSize (which caps at MB → unbounded width like "5120.0MB"),
    // this keeps the integer part to at most ~4 digits by scaling units.
    expect(formatSizeShort(5 * 1024 ** 3)).toBe("5.0 GB");
    expect(formatSizeShort(3 * 1024 ** 4)).toBe("3.0 TB");
    // Largest realistic single value before TB stays short.
    expect(formatSizeShort(1023 * 1024 ** 3).length).toBeLessThanOrEqual(9);
  });
});

describe("shortEncoding", () => {
  it("returns null for undefined", () => {
    expect(shortEncoding(undefined)).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(shortEncoding("")).toBeNull();
  });
  it("returns null for 'identity'", () => {
    expect(shortEncoding("identity")).toBeNull();
  });
  it("returns the lowercased encoding verbatim", () => {
    expect(shortEncoding("gzip")).toBe("gzip");
    expect(shortEncoding("GZIP")).toBe("gzip");
    expect(shortEncoding("br")).toBe("br");
    expect(shortEncoding("Br")).toBe("br");
    expect(shortEncoding("zstd")).toBe("zstd");
    expect(shortEncoding("deflate")).toBe("deflate");
  });
  it("preserves multi-encoding strings verbatim (lowercased)", () => {
    expect(shortEncoding("gzip, br")).toBe("gzip, br");
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

describe("formatAbsoluteTime", () => {
  // Use a UTC timestamp so the UTC branch is deterministic.
  const ts = "2024-06-15T14:30:45.123Z";

  it("formats with millisecond resolution in UTC", () => {
    expect(formatAbsoluteTime(ts, "utc")).toBe("14:30:45.123");
  });

  it("formats with millisecond resolution in local time", () => {
    // We can't assert the exact value (depends on runner TZ), but verify
    // the HH:MM:SS.mmm shape and that milliseconds are preserved.
    const result = formatAbsoluteTime(ts, "local");
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(result.slice(-3)).toBe("123");
  });

  it("defaults to local time zone", () => {
    expect(formatAbsoluteTime(ts)).toBe(formatAbsoluteTime(ts, "local"));
  });

  it("pads hours, minutes, seconds, and milliseconds", () => {
    // 2024-01-01T01:02:03.004Z → "01:02:03.004" in UTC
    expect(formatAbsoluteTime("2024-01-01T01:02:03.004Z", "utc")).toBe(
      "01:02:03.004",
    );
  });

  it("handles midnight correctly", () => {
    expect(formatAbsoluteTime("2024-01-01T00:00:00.000Z", "utc")).toBe(
      "00:00:00.000",
    );
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

describe("formatRelative", () => {
  const base = "2024-01-01T12:00:00.000Z";
  const baseMs = new Date(base).getTime();

  it("returns 'now' for 0 seconds elapsed", () => {
    expect(formatRelative(base, baseMs)).toBe("now");
  });

  it("returns 'now' for 4 seconds elapsed", () => {
    expect(formatRelative(base, baseMs + 4000)).toBe("now");
  });

  it("returns '5s' at the 5-second boundary", () => {
    expect(formatRelative(base, baseMs + 5000)).toBe("5s");
  });

  it("returns '59s' just before 1-minute boundary", () => {
    expect(formatRelative(base, baseMs + 59000)).toBe("59s");
  });

  it("returns '1m' at the 60-second boundary", () => {
    expect(formatRelative(base, baseMs + 60000)).toBe("1m");
  });

  it("returns '3m' for 3 minutes", () => {
    expect(formatRelative(base, baseMs + 3 * 60 * 1000)).toBe("3m");
  });

  it("returns '59m' just before 1-hour boundary", () => {
    expect(formatRelative(base, baseMs + 59 * 60 * 1000)).toBe("59m");
  });

  it("returns '1h' at the 1-hour boundary", () => {
    expect(formatRelative(base, baseMs + 60 * 60 * 1000)).toBe("1h");
  });

  it("returns '3h' for 3 hours", () => {
    expect(formatRelative(base, baseMs + 3 * 60 * 60 * 1000)).toBe("3h");
  });

  it("uses Date.now() when no now argument is provided", () => {
    // Timestamp far in the past — result should be something hour-like, not 'now'
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelative(old)).toBe("2h");
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

describe("eventTypeBadgeClass", () => {
  it("returns purple classes for message_start", () => {
    expect(eventTypeBadgeClass("message_start")).toBe(
      "text-purple-500 bg-purple-500/10",
    );
  });

  it("returns ok classes for content_block_start", () => {
    expect(eventTypeBadgeClass("content_block_start")).toBe(
      "text-ok bg-green-500/10",
    );
  });

  it("returns ok classes for content_block_stop", () => {
    expect(eventTypeBadgeClass("content_block_stop")).toBe(
      "text-ok bg-green-500/10",
    );
  });

  it("returns ok classes for content_block_delta", () => {
    expect(eventTypeBadgeClass("content_block_delta")).toBe(
      "text-ok bg-green-500/10",
    );
  });

  it("returns primary classes for message_delta", () => {
    expect(eventTypeBadgeClass("message_delta")).toBe(
      "text-primary bg-primary/10",
    );
  });

  it("returns muted classes for message_stop", () => {
    expect(eventTypeBadgeClass("message_stop")).toBe(
      "text-muted-foreground bg-muted",
    );
  });

  it("returns muted classes for ping", () => {
    expect(eventTypeBadgeClass("ping")).toBe("text-muted-foreground bg-muted");
  });

  it("returns secondary classes for an unknown type", () => {
    expect(eventTypeBadgeClass("some_custom_event")).toBe(
      "text-secondary-foreground bg-muted",
    );
  });

  it("returns secondary classes for empty string", () => {
    expect(eventTypeBadgeClass("")).toBe("text-secondary-foreground bg-muted");
  });
});

// ---------------------------------------------------------------------------
// Headers utilities
// ---------------------------------------------------------------------------

describe("maskHeaderValue", () => {
  it("passes non-authorization headers through unchanged", () => {
    expect(maskHeaderValue("content-type", "application/json")).toBe(
      "application/json",
    );
  });

  it("passes mixed-case non-authorization through unchanged", () => {
    expect(maskHeaderValue("X-Request-Id", "abc-123")).toBe("abc-123");
  });

  it("masks bearer token — keeps scheme, replaces credential", () => {
    expect(maskHeaderValue("authorization", "Bearer secret-token-xyz")).toBe(
      "Bearer **********",
    );
  });

  it("masks bearer token regardless of Authorization capitalisation", () => {
    expect(maskHeaderValue("Authorization", "Bearer mytoken")).toBe(
      "Bearer **********",
    );
  });

  it("masks Basic auth — keeps scheme word", () => {
    expect(maskHeaderValue("authorization", "Basic dXNlcjpwYXNz")).toBe(
      "Basic **********",
    );
  });

  it("masks a value with no space using first 8 chars", () => {
    expect(maskHeaderValue("authorization", "abcdefghijklmno")).toBe(
      "abcdefgh**********",
    );
  });

  it("masks a value shorter than 8 chars with no space", () => {
    expect(maskHeaderValue("authorization", "abc")).toBe("abc**********");
  });
});

describe("decodeBasicAuth", () => {
  it("returns null for non-Basic values", () => {
    expect(decodeBasicAuth("Bearer mytoken")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(decodeBasicAuth("")).toBeNull();
  });

  it("decodes a valid Basic credential", () => {
    // "user:pass" base64-encodes to "dXNlcjpwYXNz"
    expect(decodeBasicAuth("Basic dXNlcjpwYXNz")).toBe("user:pass");
  });

  it("is case-insensitive on the 'basic' prefix", () => {
    expect(decodeBasicAuth("BASIC dXNlcjpwYXNz")).toBe("user:pass");
  });

  it("trims whitespace from the payload before decoding", () => {
    expect(decodeBasicAuth("Basic  dXNlcjpwYXNz ")).toBe("user:pass");
  });

  it("returns null for malformed base64", () => {
    expect(decodeBasicAuth("Basic !!!not-valid-base64!!!")).toBeNull();
  });
});

describe("filterHeaders", () => {
  const headers = [
    { name: "Content-Type", value: "application/json" },
    { name: "Authorization", value: "Bearer token" },
    { name: "X-Request-Id", value: "abc-123" },
  ];

  it("returns all headers when query is empty", () => {
    expect(filterHeaders(headers, "")).toEqual(headers);
  });

  it("matches by name substring (case-insensitive)", () => {
    expect(filterHeaders(headers, "content")).toHaveLength(1);
    expect(filterHeaders(headers, "CONTENT")).toHaveLength(1);
    expect(filterHeaders(headers, "content")[0].name).toBe("Content-Type");
  });

  it("matches by value substring (case-insensitive)", () => {
    expect(filterHeaders(headers, "bearer")).toHaveLength(1);
    expect(filterHeaders(headers, "BEARER")).toHaveLength(1);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterHeaders(headers, "zzz")).toHaveLength(0);
  });

  it("does not mutate the input array", () => {
    const copy = [...headers];
    filterHeaders(headers, "content");
    expect(headers).toEqual(copy);
  });

  it("can match multiple headers", () => {
    // Both 'Content-Type' (name) and 'Authorization' (name) contain the letter 'a'
    // via their names/values; a broad query matches several
    expect(filterHeaders(headers, "application")).toHaveLength(1);
    // Empty query still returns all
    expect(filterHeaders(headers, "")).toHaveLength(3);
  });
});

describe("sortHeadersByPin", () => {
  it("places pinned headers before unpinned headers", () => {
    const input = [
      { name: "x-custom", value: "1" },
      { name: "content-type", value: "application/json" },
    ];
    const result = sortHeadersByPin(input);
    expect(result[0].name).toBe("content-type");
    expect(result[1].name).toBe("x-custom");
  });

  it("preserves original order among unpinned headers", () => {
    const input = [
      { name: "x-beta", value: "b" },
      { name: "x-alpha", value: "a" },
    ];
    const result = sortHeadersByPin(input);
    expect(result.map((h) => h.name)).toEqual(["x-beta", "x-alpha"]);
  });

  it("sorts multiple pinned headers by PINNED_HEADER_NAMES order", () => {
    const input = [
      { name: "cache-control", value: "no-cache" },
      { name: "content-type", value: "application/json" },
      { name: "authorization", value: "Bearer token" },
    ];
    const result = sortHeadersByPin(input);
    // Expected order: content-type (0), authorization (2), cache-control (4)
    expect(result.map((h) => h.name)).toEqual([
      "content-type",
      "authorization",
      "cache-control",
    ]);
  });

  it("handles a list that is all pinned", () => {
    const input = [
      { name: "traceparent", value: "t" },
      { name: "content-type", value: "application/json" },
    ];
    const result = sortHeadersByPin(input);
    expect(result[0].name).toBe("content-type"); // lower index in PINNED_HEADER_NAMES
    expect(result[1].name).toBe("traceparent");
  });

  it("handles a list that has no pinned headers", () => {
    const input = [
      { name: "x-a", value: "1" },
      { name: "x-b", value: "2" },
    ];
    const result = sortHeadersByPin(input);
    expect(result.map((h) => h.name)).toEqual(["x-a", "x-b"]);
  });

  it("is case-insensitive for pin matching", () => {
    const input = [
      { name: "X-Custom", value: "c" },
      { name: "Content-Type", value: "application/json" }, // uppercase C
    ];
    const result = sortHeadersByPin(input);
    expect(result[0].name).toBe("Content-Type");
    expect(result[1].name).toBe("X-Custom");
  });

  it("does not mutate the input array", () => {
    const input = [
      { name: "x-custom", value: "c" },
      { name: "content-type", value: "application/json" },
    ];
    const copy = [...input];
    sortHeadersByPin(input);
    expect(input).toEqual(copy);
  });
});

describe("cn", () => {
  it("merges basic classes", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("deduplicates conflicting Tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles conditional classes via clsx", () => {
    const isHidden = false;
    expect(cn("base", isHidden && "hidden", "extra")).toBe("base extra");
  });

  it("preserves the base text-ui font-size alongside text-color", () => {
    // text-ui is the 13px base UI font-size token; text-m-get is a color.
    // Registered via the `theme.text` namespace so twMerge keeps both.
    expect(cn("text-ui", "text-m-get")).toBe("text-ui text-m-get");
  });

  it("preserves custom font-size text-ui-xs alongside text-color", () => {
    // text-ui-xs is a custom font-size token; text-m-get is a color.
    // Without extendTailwindMerge config, twMerge strips the font-size.
    expect(cn("text-ui-xs", "text-m-get")).toBe("text-ui-xs text-m-get");
  });

  it("preserves custom font-size text-ui-sm alongside text-color", () => {
    expect(cn("text-ui-sm", "text-green")).toBe("text-ui-sm text-green");
  });

  it("preserves text-ctx-path alongside text-color", () => {
    expect(cn("text-ctx-path", "text-ink")).toBe("text-ctx-path text-ink");
  });

  it("still deduplicates conflicting custom font sizes", () => {
    expect(cn("text-ui-xs", "text-ui-sm")).toBe("text-ui-sm");
    expect(cn("text-ui", "text-ui-sm")).toBe("text-ui-sm");
  });

  it("deduplicates conflicting custom font families", () => {
    // font-mono should win over font-ui when both are passed.
    expect(cn("font-ui", "font-mono")).toBe("font-mono");
  });

  it("preserves font-family alongside font-size and text-color", () => {
    // All three groups are independent and should coexist.
    expect(cn("font-mono", "text-ui-xs", "text-dim")).toBe(
      "font-mono text-ui-xs text-dim",
    );
  });
});
