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

  it("declares the four supported desktop widths including 1024", () => {
    expect([...SUPPORTED_WIDTHS]).toEqual([1024, 1280, 1440, 1920]);
  });

  it("getScene resolves known ids and rejects unknown ones", () => {
    expect(getScene("empty")?.id).toBe("empty");
    expect(getScene("does-not-exist")).toBeUndefined();
  });

  it("harness list() omits bestiary-only scenes but apply() still resolves them", () => {
    installSceneHarness(useStore);
    const harness = window.__test_scenes!;

    const listed = new Set(harness.list().map((s) => s.id));
    const bestiaryOnly = SCENES.filter((s) => s.bestiaryOnly);
    // Guards the premise: there is at least one bestiary-only scene to exclude.
    expect(bestiaryOnly.length).toBeGreaterThan(0);
    for (const s of bestiaryOnly) expect(listed.has(s.id)).toBe(false);
    // …and every matrix scene IS listed.
    for (const s of SCENES.filter((s) => !s.bestiaryOnly)) {
      expect(listed.has(s.id)).toBe(true);
    }
    // apply() resolves a bestiary-only scene by id — the bestiary's render path.
    expect(harness.apply(bestiaryOnly[0].id)).toBe(true);
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

  it("table-dual-size crosses table mode with a cached dual-size row", () => {
    applySceneToStore(useStore, getScene("table-dual-size")!);
    const state = useStore.getState();
    expect(state.listMode).toBe("table");
    // backdrop ids 1..4 plus the gzip stress row at id 5.
    expect(state.ids).toEqual([1, 2, 3, 4, 5]);
    const body = state.exchanges.get(5)?.responseBody;
    expect(body?.contentEncoding).toBe("gzip");
    expect(body?.decodedBytes).toBe(GZIP_JSON_DECODED_BYTES);
    expect(body?.decodedBytes).not.toBe(body?.wireBytes);
    expect(state.selectedId).toBe(5);
  });

  it("compact cross-axis scenes set both density and their data extreme", () => {
    applySceneToStore(useStore, getScene("compact-table-long-uri")!);
    let state = useStore.getState();
    expect(state.listMode).toBe("table");
    expect(state.density).toBe("compact");
    expect(state.exchanges.get(5)?.uri).toBe(LONG_URI);

    applySceneToStore(useStore, getScene("compact-rows-dual-size")!);
    state = useStore.getState();
    // compact-rows-dual-size explicitly sets rows mode.
    expect(state.listMode).toBe("rows");
    expect(state.density).toBe("compact");
    expect(state.exchanges.get(5)?.responseBody?.decodedBytes).toBe(
      GZIP_JSON_DECODED_BYTES,
    );
  });

  it("mixed-table composes plain, dual-size, long-uri, and error rows", () => {
    applySceneToStore(useStore, getScene("mixed-table")!);
    const state = useStore.getState();
    expect(state.listMode).toBe("table");
    expect(state.ids).toEqual([1, 2, 3, 4, 5, 6]);
    // gzip dual-size row.
    expect(state.exchanges.get(3)?.responseBody?.decodedBytes).toBe(
      GZIP_JSON_DECODED_BYTES,
    );
    // long-uri row.
    expect(state.exchanges.get(4)?.uri).toBe(LONG_URI);
    // error row: no status, carries an error.
    expect(state.exchanges.get(5)?.status).toBeUndefined();
    expect(state.exchanges.get(5)?.error?.message).toContain(
      "connection refused",
    );
  });

  it("trace-group parses traceparent into shared trace ids", () => {
    applySceneToStore(useStore, getScene("trace-group")!);
    const ex = (id: number) => useStore.getState().exchanges.get(id);
    expect(useStore.getState().ids).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // Trace A spans ids 1/3/5; trace B spans 4/6; 2 and 7 are untraced.
    const traceA = ex(1)?.traceId;
    const traceB = ex(4)?.traceId;
    expect(traceA).toBeDefined();
    expect(traceB).toBeDefined();
    expect(traceA).not.toBe(traceB);
    expect(ex(3)?.traceId).toBe(traceA);
    expect(ex(5)?.traceId).toBe(traceA);
    expect(ex(6)?.traceId).toBe(traceB);
    expect(ex(2)?.traceId).toBeUndefined();
    expect(ex(7)?.traceId).toBeUndefined();
    // Selected id 5 has a forward "next in trace" target under newest-first.
    expect(useStore.getState().selectedId).toBe(5);
    // No trace filter is active in the grouping scene.
    expect(useStore.getState().traceFilter).toBeNull();
  });

  it("trace-filtered activates the trace filter on trace A", () => {
    applySceneToStore(useStore, getScene("trace-filtered")!);
    const state = useStore.getState();
    // The active filter equals trace A (the trace of ids 1/3/5).
    expect(state.traceFilter).toBe(state.exchanges.get(1)?.traceId);
    expect(state.traceFilter).not.toBeNull();
    // All seven exchanges still injected; the filter is applied at render time.
    expect(state.ids).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("resets the trace filter back to null on a non-trace scene", () => {
    applySceneToStore(useStore, getScene("trace-filtered")!);
    expect(useStore.getState().traceFilter).not.toBeNull();
    applySceneToStore(useStore, getScene("selected")!);
    expect(useStore.getState().traceFilter).toBeNull();
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

describe("new scenes (PRO-396)", () => {
  it("body-awaiting has only a request — no response body or status", () => {
    applySceneToStore(useStore, getScene("body-awaiting")!);
    const state = useStore.getState();
    expect(state.ids).toEqual([1]);
    const ex = state.exchanges.get(1);
    expect(ex?.status).toBeUndefined();
    expect(ex?.responseBody).toBeUndefined();
    expect(state.selectedId).toBe(1);
  });

  it("body-no-body has a 204 response with no body state", () => {
    applySceneToStore(useStore, getScene("body-no-body")!);
    const state = useStore.getState();
    expect(state.ids).toEqual([1]);
    const ex = state.exchanges.get(1);
    expect(ex?.status).toBe("204 No Content");
    expect(ex?.responseBody).toBeUndefined();
    expect(state.selectedId).toBe(1);
  });

  it("body-text has a text/plain response body", () => {
    applySceneToStore(useStore, getScene("body-text")!);
    const state = useStore.getState();
    const body = state.exchanges.get(1)?.responseBody;
    expect(body).toBeDefined();
    expect(body?.atEnd).toBe(true);
    expect(body?.contentType).toMatch(/text\/plain/);
  });

  it("body-binary has an octet-stream response body", () => {
    applySceneToStore(useStore, getScene("body-binary")!);
    const state = useStore.getState();
    const body = state.exchanges.get(1)?.responseBody;
    expect(body).toBeDefined();
    expect(body?.atEnd).toBe(true);
    expect(body?.contentType).toMatch(/octet-stream/);
  });

  it("body-decode-failed has a gzip-encoded response body with corrupt payload", () => {
    applySceneToStore(useStore, getScene("body-decode-failed")!);
    const state = useStore.getState();
    const body = state.exchanges.get(1)?.responseBody;
    expect(body).toBeDefined();
    expect(body?.atEnd).toBe(true);
    expect(body?.contentEncoding).toBe("gzip");
  });

  it("ndjson has an application/x-ndjson response body", () => {
    applySceneToStore(useStore, getScene("ndjson")!);
    const state = useStore.getState();
    const body = state.exchanges.get(1)?.responseBody;
    expect(body).toBeDefined();
    expect(body?.atEnd).toBe(true);
    expect(body?.contentType).toMatch(/ndjson/);
  });

  it("compact-inspector sets compact density with a selected exchange that has a body", () => {
    applySceneToStore(useStore, getScene("compact-inspector")!);
    const state = useStore.getState();
    expect(state.density).toBe("compact");
    expect(state.selectedId).toBe(2);
    expect(state.exchanges.get(2)?.responseBody).toBeDefined();
  });

  it("headers-selected has many request and response headers", () => {
    applySceneToStore(useStore, getScene("headers-selected")!);
    const state = useStore.getState();
    expect(state.selectedId).toBe(1);
    const ex = state.exchanges.get(1);
    expect(ex?.requestHeaders?.length).toBeGreaterThanOrEqual(8);
    expect(ex?.responseHeaders?.length).toBeGreaterThanOrEqual(8);
  });

  it("timing-selected has a traced exchange with elapsed time", () => {
    applySceneToStore(useStore, getScene("timing-selected")!);
    const state = useStore.getState();
    expect(state.selectedId).toBe(1);
    const ex = state.exchanges.get(1);
    expect(ex?.elapsedMs).toBeGreaterThan(1000);
    expect(ex?.traceId).toBeDefined();
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
    // list() exposes the test matrix — bestiary-only scenes are excluded.
    expect(harness.list().map((s) => s.id)).toEqual(
      SCENES.filter((s) => !s.bestiaryOnly).map((s) => s.id),
    );
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
