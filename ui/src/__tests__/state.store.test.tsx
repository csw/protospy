import { describe, it, expect, beforeEach } from "vitest";
import type { EventMessage } from "@bindings/EventMessage";
import { useStore } from "@ui/state/store";
import { DEFAULT_THEME } from "@ui/theme/applyTheme";
import { makeGetRequest } from "@ui/test/fixtures";

describe("state/store", () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true);
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  describe("factory / initial state", () => {
    it("has expected defaults", () => {
      const state = useStore.getState();
      expect(state.exchanges).toBeInstanceOf(Map);
      expect(state.exchanges.size).toBe(0);
      expect(state.ids).toEqual([]);
      expect(state.connection).toBe("connecting");
      expect(state.service).toBeNull();
      expect(state.selectedId).toBeNull();
      expect(state.filter).toBe("");
      expect(state.traceFilter).toBeNull();
      expect(state.hoverTraceId).toBeNull();
      expect(state.listMode).toBe("rows");
      expect(state.listWidth).toEqual({ rows: 340, table: 720 });
      expect(state.order).toBe("newest");
      expect(state.density).toBe("regular");
      expect(state.traceGroupOn).toBe(false);
      expect(state.cmdKOpen).toBe(false);
      expect(useStore.getState().protocol).toBeNull();
    });

    it("has theme matching DEFAULT_THEME at creation", () => {
      expect(useStore.getState().theme).toBe(DEFAULT_THEME);
    });
  });

  describe("UI setters", () => {
    it("setSelectedId sets and reads", () => {
      useStore.getState().setSelectedId(42);
      expect(useStore.getState().selectedId).toBe(42);
      useStore.getState().setSelectedId(null);
      expect(useStore.getState().selectedId).toBeNull();
    });

    it("setFilter sets and reads", () => {
      useStore.getState().setFilter("GET /api");
      expect(useStore.getState().filter).toBe("GET /api");
    });

    it("setTraceFilter sets and reads", () => {
      useStore.getState().setTraceFilter("abc123");
      expect(useStore.getState().traceFilter).toBe("abc123");
      useStore.getState().setTraceFilter(null);
      expect(useStore.getState().traceFilter).toBeNull();
    });

    it("setHoverTraceId sets and reads", () => {
      useStore.getState().setHoverTraceId("trace-xyz");
      expect(useStore.getState().hoverTraceId).toBe("trace-xyz");
      useStore.getState().setHoverTraceId(null);
      expect(useStore.getState().hoverTraceId).toBeNull();
    });

    it("setListMode sets and reads", () => {
      useStore.getState().setListMode("table");
      expect(useStore.getState().listMode).toBe("table");
      useStore.getState().setListMode("rows");
      expect(useStore.getState().listMode).toBe("rows");
    });

    it("setOrder sets and reads", () => {
      useStore.getState().setOrder("oldest");
      expect(useStore.getState().order).toBe("oldest");
      useStore.getState().setOrder("newest");
      expect(useStore.getState().order).toBe("newest");
    });

    it("setDensity sets and reads", () => {
      useStore.getState().setDensity("compact");
      expect(useStore.getState().density).toBe("compact");
      useStore.getState().setDensity("regular");
      expect(useStore.getState().density).toBe("regular");
    });

    it("setCmdKOpen sets and reads", () => {
      useStore.getState().setCmdKOpen(true);
      expect(useStore.getState().cmdKOpen).toBe(true);
      useStore.getState().setCmdKOpen(false);
      expect(useStore.getState().cmdKOpen).toBe(false);
    });
  });

  describe("setListWidth", () => {
    it('updates only "rows", leaves "table" untouched', () => {
      const before = useStore.getState().listWidth;
      useStore.getState().setListWidth("rows", 500);
      const after = useStore.getState().listWidth;
      expect(after.rows).toBe(500);
      expect(after.table).toBe(before.table);
    });

    it('updates only "table", leaves "rows" untouched', () => {
      const before = useStore.getState().listWidth;
      useStore.getState().setListWidth("table", 900);
      const after = useStore.getState().listWidth;
      expect(after.table).toBe(900);
      expect(after.rows).toBe(before.rows);
    });
  });

  describe("toggleTraceGroup", () => {
    it("flips traceGroupOn", () => {
      expect(useStore.getState().traceGroupOn).toBe(false);
      useStore.getState().toggleTraceGroup();
      expect(useStore.getState().traceGroupOn).toBe(true);
      useStore.getState().toggleTraceGroup();
      expect(useStore.getState().traceGroupOn).toBe(false);
    });
  });

  describe("setTheme", () => {
    it("sets theme to each valid value", () => {
      useStore.getState().setTheme("light");
      expect(useStore.getState().theme).toBe("light");
      useStore.getState().setTheme("dark");
      expect(useStore.getState().theme).toBe("dark");
      useStore.getState().setTheme("system");
      expect(useStore.getState().theme).toBe("system");
    });

    it("drives data-theme on documentElement via the subscriber", () => {
      useStore.getState().setTheme("light");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      useStore.getState().setTheme("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("persists theme to localStorage via persist middleware", () => {
      useStore.getState().setTheme("light");
      const stored = JSON.parse(
        localStorage.getItem("protospy-ui-prefs") ?? "{}",
      );
      expect(stored.state.theme).toBe("light");
    });
  });

  describe("applyEvent", () => {
    it("forwards a Request event to the reducer, populating ids and exchanges", () => {
      const msg = makeGetRequest(1) as unknown as EventMessage;
      useStore.getState().applyEvent(msg);
      const state = useStore.getState();
      expect(state.ids).toContain(1);
      expect(state.exchanges.has(1)).toBe(true);
      const ex = state.exchanges.get(1);
      expect(ex?.method).toBe("GET");
      expect(ex?.uri).toBe("/api/test");
    });
  });

  describe("setBodyDecodedBytes", () => {
    it("writes decodedBytes onto the response body and returns a new exchange", () => {
      useStore
        .getState()
        .applyEvent(makeGetRequest(1) as unknown as EventMessage);
      // Seed a response body so the action has something to update.
      useStore.setState((s) => {
        const exchanges = new Map(s.exchanges);
        const ex = exchanges.get(1)!;
        exchanges.set(1, {
          ...ex,
          responseBody: { chunks: [], atEnd: true, wireBytes: 28 },
        });
        return { exchanges };
      });
      useStore.getState().setBodyDecodedBytes(1, "response", 64);
      const body = useStore.getState().exchanges.get(1)?.responseBody;
      expect(body?.decodedBytes).toBe(64);
    });

    it("writes decodedBytes onto the request body", () => {
      useStore
        .getState()
        .applyEvent(makeGetRequest(1) as unknown as EventMessage);
      useStore.setState((s) => {
        const exchanges = new Map(s.exchanges);
        const ex = exchanges.get(1)!;
        exchanges.set(1, {
          ...ex,
          requestBody: { chunks: [], atEnd: true, wireBytes: 10 },
        });
        return { exchanges };
      });
      useStore.getState().setBodyDecodedBytes(1, "request", 20);
      const body = useStore.getState().exchanges.get(1)?.requestBody;
      expect(body?.decodedBytes).toBe(20);
    });

    it("no-ops when the exchange is missing", () => {
      const before = useStore.getState().exchanges;
      useStore.getState().setBodyDecodedBytes(999, "response", 64);
      expect(useStore.getState().exchanges).toBe(before);
    });

    it("no-ops when the body for the direction is missing", () => {
      useStore
        .getState()
        .applyEvent(makeGetRequest(1) as unknown as EventMessage);
      const before = useStore.getState().exchanges;
      // No response body on a fresh GET request.
      useStore.getState().setBodyDecodedBytes(1, "response", 64);
      expect(useStore.getState().exchanges).toBe(before);
    });

    it("no-ops when decodedBytes is unchanged", () => {
      useStore
        .getState()
        .applyEvent(makeGetRequest(1) as unknown as EventMessage);
      useStore.setState((s) => {
        const exchanges = new Map(s.exchanges);
        const ex = exchanges.get(1)!;
        exchanges.set(1, {
          ...ex,
          responseBody: {
            chunks: [],
            atEnd: true,
            wireBytes: 28,
            decodedBytes: 64,
          },
        });
        return { exchanges };
      });
      const before = useStore.getState().exchanges;
      useStore.getState().setBodyDecodedBytes(1, "response", 64);
      // Same identity — proves we short-circuited.
      expect(useStore.getState().exchanges).toBe(before);
    });
  });

  describe("setConnection / setService", () => {
    it("setConnection updates connection status", () => {
      useStore.getState().setConnection("open");
      expect(useStore.getState().connection).toBe("open");
      useStore.getState().setConnection("reconnecting");
      expect(useStore.getState().connection).toBe("reconnecting");
    });

    it("setService updates the service name", () => {
      useStore.getState().setService("elasticflix");
      expect(useStore.getState().service).toBe("elasticflix");
    });
  });

  describe("setProtocol", () => {
    it("setProtocol updates protocol and setProtocol(null) clears it", () => {
      const store = useStore.getState();
      store.setProtocol("Anthropic");
      expect(useStore.getState().protocol).toBe("Anthropic");
      useStore.getState().setProtocol(null);
      expect(useStore.getState().protocol).toBeNull();
    });
  });

  describe("persist middleware", () => {
    it("persists UI preferences to localStorage under protospy-ui-prefs", () => {
      useStore.getState().setDensity("compact");
      useStore.getState().setOrder("oldest");
      useStore.getState().setListMode("table");
      useStore.getState().toggleTraceGroup();
      useStore.getState().setListWidth("rows", 500);

      const stored = JSON.parse(
        localStorage.getItem("protospy-ui-prefs") ?? "{}",
      );
      expect(stored.state).toMatchObject({
        density: "compact",
        order: "oldest",
        listMode: "table",
        traceGroupOn: true,
        listWidth: { rows: 500, table: 720 },
      });
    });

    it("does not persist ephemeral state like filter or selectedId", () => {
      useStore.getState().setFilter("GET /api");
      useStore.getState().setSelectedId(42);
      useStore.getState().setCmdKOpen(true);

      const stored = JSON.parse(
        localStorage.getItem("protospy-ui-prefs") ?? "{}",
      );
      expect(stored.state).not.toHaveProperty("filter");
      expect(stored.state).not.toHaveProperty("selectedId");
      expect(stored.state).not.toHaveProperty("cmdKOpen");
      expect(stored.state).not.toHaveProperty("exchanges");
    });

    it("rehydrates persisted preferences from localStorage", async () => {
      useStore.setState(useStore.getInitialState(), true);

      localStorage.setItem(
        "protospy-ui-prefs",
        JSON.stringify({
          state: {
            density: "compact",
            order: "oldest",
            listMode: "table",
            listWidth: { rows: 340, table: 999 },
            traceGroupOn: true,
            theme: "dark",
          },
          version: 1,
        }),
      );

      await new Promise<void>((resolve) => {
        const unsub = useStore.persist.onFinishHydration(() => {
          unsub();
          resolve();
        });
        useStore.persist.rehydrate();
      });

      const state = useStore.getState();
      expect(state.density).toBe("compact");
      expect(state.order).toBe("oldest");
      expect(state.listMode).toBe("table");
      expect(state.listWidth.table).toBe(999);
      expect(state.traceGroupOn).toBe(true);
      expect(state.theme).toBe("dark");
    });
  });
});
