import { describe, it, expect } from "vitest";
import { showPairsTab } from "@ui/protocol";

describe("showPairsTab", () => {
  it("returns false when protocol is null, even for a bulk URI", () => {
    expect(showPairsTab(null, "/_msearch")).toBe(false);
  });

  it("returns false when protocol is null and uri is undefined", () => {
    expect(showPairsTab(null, undefined)).toBe(false);
  });

  it("returns true for Elasticsearch + _msearch", () => {
    expect(showPairsTab("Elasticsearch", "/_msearch")).toBe(true);
  });

  it("returns true for Elasticsearch + _mget", () => {
    expect(showPairsTab("Elasticsearch", "/_mget")).toBe(true);
  });

  it("returns true for OpenSearch + _msearch", () => {
    expect(showPairsTab("OpenSearch", "/_msearch")).toBe(true);
  });

  it("returns true for OpenSearch + _mget", () => {
    expect(showPairsTab("OpenSearch", "/_mget")).toBe(true);
  });

  it("returns false for Anthropic + _msearch URI", () => {
    expect(showPairsTab("Anthropic", "/_msearch")).toBe(false);
  });

  it("returns false for Elasticsearch + non-bulk URI", () => {
    expect(showPairsTab("Elasticsearch", "/api/search")).toBe(false);
  });

  it("returns false for Elasticsearch + undefined URI", () => {
    expect(showPairsTab("Elasticsearch", undefined)).toBe(false);
  });

  it("returns true for Elasticsearch + index-prefixed _msearch path", () => {
    expect(showPairsTab("Elasticsearch", "/my-index/_msearch")).toBe(true);
  });

  it("returns true for OpenSearch + _msearch with query string", () => {
    expect(showPairsTab("OpenSearch", "/index/_msearch?typed_keys=true")).toBe(
      true,
    );
  });
});
