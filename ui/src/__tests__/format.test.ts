import { describe, it, expect } from "vitest";
import { fmtBytes, fmtMs, fmtClock, mediaTypeSlug } from "@ui/lib/format";

describe("fmtBytes", () => {
  it("renders raw bytes with a spaced unit, no decimals", () => {
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(503)).toBe("503 B");
    expect(fmtBytes(1023)).toBe("1023 B");
  });

  it("scales to KB/MB with one decimal and a leading space", () => {
    expect(fmtBytes(1024)).toBe("1.0 KB");
    expect(fmtBytes(1536)).toBe("1.5 KB");
    expect(fmtBytes(1024 * 1024)).toBe("1.0 MB");
    expect(fmtBytes(5.5 * 1024 * 1024)).toBe("5.5 MB");
  });

  it("scales through GB and TB", () => {
    expect(fmtBytes(2.3 * 1024 ** 3)).toBe("2.3 GB");
    expect(fmtBytes(5 * 1024 ** 3)).toBe("5.0 GB");
    expect(fmtBytes(3 * 1024 ** 4)).toBe("3.0 TB");
  });

  it("rolls up a unit when rounding tips the value to ≥ 1024", () => {
    // 1023.999… KB rounds to 1024.0 KB → roll up to 1.0 MB.
    expect(fmtBytes(1024 * 1024 - 1)).toBe("1.0 MB");
    expect(fmtBytes(1024 ** 3 - 1)).toBe("1.0 GB");
    expect(fmtBytes(1024 ** 4 - 1)).toBe("1.0 TB");
  });

  it("stays a bounded width even at the largest GB value", () => {
    // "1023.9 GB" is the widest pre-TB value — 9 chars.
    expect(fmtBytes(1023 * 1024 ** 3).length).toBeLessThanOrEqual(9);
  });
});

describe("fmtMs", () => {
  it("renders null elapsed as an em dash", () => {
    expect(fmtMs(null)).toBe("—");
  });

  it("renders sub-second values as whole milliseconds with a spaced unit", () => {
    expect(fmtMs(0)).toBe("0 ms");
    expect(fmtMs(503)).toBe("503 ms");
    expect(fmtMs(999)).toBe("999 ms");
  });

  it("rounds fractional milliseconds", () => {
    expect(fmtMs(42.6)).toBe("43 ms");
  });

  it("renders ≥ 1 s as seconds to one decimal with a spaced unit", () => {
    expect(fmtMs(1000)).toBe("1.0 s");
    expect(fmtMs(1200)).toBe("1.2 s");
    expect(fmtMs(1500)).toBe("1.5 s");
    expect(fmtMs(59900)).toBe("59.9 s");
  });
});

describe("fmtClock", () => {
  it("renders HH:MM:SS.mmm in UTC for a known instant", () => {
    const epochMs = Date.UTC(2024, 0, 15, 14, 32, 9, 847);
    expect(fmtClock(epochMs, "utc")).toBe("14:32:09.847");
  });

  it("zero-pads hours, minutes, seconds, and milliseconds", () => {
    expect(fmtClock(Date.UTC(2024, 0, 1, 1, 2, 3, 4), "utc")).toBe(
      "01:02:03.004",
    );
    expect(fmtClock(Date.UTC(2024, 0, 1, 0, 0, 0, 0), "utc")).toBe(
      "00:00:00.000",
    );
  });

  it("defaults to local time", () => {
    const epochMs = Date.UTC(2024, 0, 15, 14, 32, 9, 847);
    expect(fmtClock(epochMs)).toBe(fmtClock(epochMs, "local"));
  });

  it("renders local time in the HH:MM:SS.mmm shape", () => {
    const epochMs = Date.UTC(2024, 0, 15, 14, 32, 9, 847);
    expect(fmtClock(epochMs, "local")).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it("local and UTC differ by the zone offset for a known instant", () => {
    // A non-zero local offset is the common case; when the test runs in UTC the
    // two coincide. Either way the local render must be well-formed.
    const epochMs = Date.UTC(2024, 5, 1, 12, 0, 0, 0);
    const local = fmtClock(epochMs, "local");
    const utc = fmtClock(epochMs, "utc");
    const offsetMin = new Date(epochMs).getTimezoneOffset();
    if (offsetMin === 0) {
      expect(local).toBe(utc);
    } else {
      expect(local).not.toBe(utc);
    }
  });
});

describe("mediaTypeSlug", () => {
  it("collapses a long vendor type with params to its structured suffix", () => {
    expect(
      mediaTypeSlug("application/vnd.elasticsearch+json; compatible-with=8"),
    ).toBe("json");
  });

  it("drops parameters and collapses common types", () => {
    expect(mediaTypeSlug("application/json; charset=utf-8")).toBe("json");
    expect(mediaTypeSlug("application/hal+json")).toBe("json");
    expect(mediaTypeSlug("text/html")).toBe("html");
    expect(mediaTypeSlug("text/event-stream")).toBe("event-stream");
    expect(mediaTypeSlug("image/png")).toBe("png");
    expect(mediaTypeSlug("application/octet-stream")).toBe("octet-stream");
  });

  it("keeps the ndjson distinction (suffix wins over vendor tree)", () => {
    expect(mediaTypeSlug("application/x-ndjson")).toBe("x-ndjson");
    expect(mediaTypeSlug("application/vnd.elasticsearch+x-ndjson")).toBe(
      "x-ndjson",
    );
  });

  it("falls back to the whole subtype when '+' has no suffix after it", () => {
    // A trailing "+" is not a usable structured-syntax suffix — keep the subtype.
    expect(mediaTypeSlug("application/foo+")).toBe("foo+");
  });

  it("is shorter than the raw header it derives from", () => {
    const raw = "application/vnd.elasticsearch+json; compatible-with=8";
    const slug = mediaTypeSlug(raw);
    expect(slug.length).toBeLessThan(raw.length);
    // The caller keeps `raw` verbatim for the tooltip; the slug never mutates it.
    expect(raw).toBe("application/vnd.elasticsearch+json; compatible-with=8");
  });

  it("lowercases and trims", () => {
    expect(mediaTypeSlug("Application/JSON")).toBe("json");
    expect(mediaTypeSlug("  text/html  ")).toBe("html");
  });

  it("returns a value with no slash param-stripped, as-is", () => {
    expect(mediaTypeSlug("json")).toBe("json");
    expect(mediaTypeSlug("weird; charset=utf-8")).toBe("weird");
    expect(mediaTypeSlug("")).toBe("");
  });
});
