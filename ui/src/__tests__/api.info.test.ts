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
});
