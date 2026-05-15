import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchInfo } from "../api/info";

describe("fetchInfo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed Info on success", async () => {
    const data = {
      started_at: "2024-01-01T00:00:00Z",
      services: [
        {
          name: "es",
          addr: "0.0.0.0:3000",
          target: "localhost:9200",
          subscribers: 0,
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(data) }),
    );
    const result = await fetchInfo();
    expect(result).toEqual(data);
    expect(fetch).toHaveBeenCalledWith("/info");
  });

  it("throws on non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    await expect(fetchInfo()).rejects.toThrow("/info returned 503");
  });

  it("rejects with the underlying error when fetch rejects", async () => {
    const err = new TypeError("network down");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(err));
    await expect(fetchInfo()).rejects.toBe(err);
  });

  it("throws a clear invalid-JSON error when res.json() throws", async () => {
    const parseErr = new SyntaxError(
      "Unexpected token < in JSON at position 0",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(parseErr),
      }),
    );
    await expect(fetchInfo()).rejects.toThrow(
      "/info returned invalid JSON: Unexpected token < in JSON at position 0",
    );
  });

  it("includes the status code in the error message on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    await expect(fetchInfo()).rejects.toThrow("/info returned 404");
  });

  it("includes the status code in the error message on 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    await expect(fetchInfo()).rejects.toThrow("/info returned 500");
  });

  it("returns Info with an empty services array without crashing", async () => {
    const data = {
      started_at: "2024-01-01T00:00:00Z",
      services: [],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(data) }),
    );
    const result = await fetchInfo();
    expect(result).toEqual(data);
    expect(result.services).toEqual([]);
  });
});
