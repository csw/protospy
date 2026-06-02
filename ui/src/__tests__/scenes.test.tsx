import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@ui/state/store";
import {
  SCENES,
  SUPPORTED_WIDTHS,
  applySceneToStore,
  getScene,
  installSceneHarness,
} from "@ui/test/scenes";
import {
  GZIP_JSON_DECODED_BYTES,
  GZIP_JSON_WIRE_BYTES,
  LONG_URI,
  makeManyExchanges,
} from "@ui/test/fixtures";

function resetStore() {
  useStore.setState(useStore.getInitialState(), true);
}

beforeEach(() => {
  resetStore();
  delete (window as { __test_scenes?: unknown }).__test_scenes;
});

describe("scene matrix integrity", () => {
  it("has unique, kebab-case ids and valid axes", () => {
    const ids = SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCENES) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      expect(["state", "data", "view"]).toContain(s.axis);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    }
  });

  it("covers all three matrix axes", () => {
    const axes = new Set(SCENES.map((s) => s.axis));
    expect(axes).toEqual(new Set(["state", "data", "view"]));
  });

  it("declares the three supported desktop widths", () => {
    expect([...SUPPORTED_WIDTHS]).toEqual([1280, 1440, 1920]);
  });

  it("getScene resolves known ids and rejects unknown ones", () => {
    expect(getScene("empty")?.id).toBe("empty");
    expect(getScene("does-not-exist")).toBeUndefined();
  });
});

describe("applySceneToStore", () => {
  it("empty/loading scenes inject no exchanges but set connection", () => {
    applySceneToStore(useStore, getScene("empty")!);
    expect(useStore.getState().ids).toHaveLength(0);
    expect(useStore.getState().connection).toBe("open");

    applySceneToStore(useStore, getScene("loading")!);
    expect(useStore.getState().ids).toHaveLength(0);
    expect(useStore.getState().connection).toBe("connecting");
  });

  it("error-row scene produces an errored, status-less exchange", () => {
    applySceneToStore(useStore, getScene("error-row")!);
    const ex = useStore.getState().exchanges.get(1);
    expect(ex?.error).toBeDefined();
    expect(ex?.error?.message).toContain("connection refused");
    expect(ex?.status).toBeUndefined();
    expect(useStore.getState().selectedId).toBe(1);
  });

  it("selected scene selects an exchange in a populated list", () => {
    applySceneToStore(useStore, getScene("selected")!);
    expect(useStore.getState().ids.length).toBeGreaterThan(1);
    expect(useStore.getState().selectedId).toBe(2);
  });

  it("long-uri scene injects the overflowing URI", () => {
    applySceneToStore(useStore, getScene("long-uri")!);
    expect(useStore.getState().exchanges.get(1)?.uri).toBe(LONG_URI);
  });

  it("many-rows scene injects 120 exchanges", () => {
    applySceneToStore(useStore, getScene("many-rows")!);
    expect(useStore.getState().ids).toHaveLength(120);
  });

  it("dual-size scene caches decoded bytes that differ from the wire size", () => {
    applySceneToStore(useStore, getScene("dual-size")!);
    const body = useStore.getState().exchanges.get(1)?.responseBody;
    expect(body?.contentEncoding).toBe("gzip");
    expect(body?.wireBytes).toBe(GZIP_JSON_WIRE_BYTES);
    expect(body?.decodedBytes).toBe(GZIP_JSON_DECODED_BYTES);
    expect(body?.decodedBytes).not.toBe(body?.wireBytes);
  });

  it("view-axis scenes set list mode and density", () => {
    applySceneToStore(useStore, getScene("table-mode")!);
    expect(useStore.getState().listMode).toBe("table");
    expect(useStore.getState().density).toBe("regular");

    applySceneToStore(useStore, getScene("compact-table")!);
    expect(useStore.getState().listMode).toBe("table");
    expect(useStore.getState().density).toBe("compact");
  });

  it("resets prior scene state on each apply", () => {
    applySceneToStore(useStore, getScene("many-rows")!);
    expect(useStore.getState().ids).toHaveLength(120);
    applySceneToStore(useStore, getScene("empty")!);
    expect(useStore.getState().ids).toHaveLength(0);
    expect(useStore.getState().selectedId).toBeNull();
  });

  it("does not open a live subscription by leaving service unset", () => {
    applySceneToStore(useStore, getScene("selected")!);
    expect(useStore.getState().service).toBeNull();
  });
});

describe("fixture builders", () => {
  it("makeManyExchanges yields request+response pairs with rotating methods", () => {
    const msgs = makeManyExchanges(3);
    expect(msgs).toHaveLength(6);
    resetStore();
    for (const m of msgs) useStore.getState().applyEvent(m as never);
    expect(useStore.getState().ids).toEqual([1, 2, 3]);
    expect(useStore.getState().exchanges.get(1)?.method).toBe("GET");
    expect(useStore.getState().exchanges.get(2)?.method).toBe("POST");
  });
});

describe("installSceneHarness", () => {
  it("exposes a working window.__test_scenes harness", () => {
    installSceneHarness(useStore);
    const harness = (window as { __test_scenes?: ReturnType<typeof Object> })
      .__test_scenes as {
      list: () => { id: string }[];
      widths: readonly number[];
      apply: (id: string) => boolean;
    };
    expect(harness).toBeDefined();
    expect(harness.list().map((s) => s.id)).toEqual(SCENES.map((s) => s.id));
    expect([...harness.widths]).toEqual([...SUPPORTED_WIDTHS]);

    expect(harness.apply("many-rows")).toBe(true);
    expect(useStore.getState().ids).toHaveLength(120);
    expect(harness.apply("nope")).toBe(false);
  });

  it("applyAndSettle applies scene and resolves after settle delay", async () => {
    installSceneHarness(useStore);
    const harness = window.__test_scenes!;

    const start = performance.now();
    const result = await harness.applyAndSettle("many-rows", 50);
    const elapsed = performance.now() - start;

    expect(result).toBe(true);
    expect(useStore.getState().ids).toHaveLength(120);
    // Should have waited at least the settle time (50ms).
    expect(elapsed).toBeGreaterThanOrEqual(40); // allow small timer jitter
  });

  it("applyAndSettle returns false for unknown scene id", async () => {
    installSceneHarness(useStore);
    const harness = window.__test_scenes!;

    const result = await harness.applyAndSettle("does-not-exist");
    expect(result).toBe(false);
    // Store should be unchanged (no scene applied).
    expect(useStore.getState().ids).toHaveLength(0);
  });

  it("applyAndSettle uses default settle time when omitted", async () => {
    installSceneHarness(useStore);
    const harness = window.__test_scenes!;

    const start = performance.now();
    await harness.applyAndSettle("empty");
    const elapsed = performance.now() - start;

    // Default settle is 150ms; allow timer jitter.
    expect(elapsed).toBeGreaterThanOrEqual(130);
  });
});
