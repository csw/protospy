import { describe, it, expect, beforeEach } from "vitest";
import type { EventMessage } from "@bindings/EventMessage";
import { useStore } from "@ui/state/store";
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

    it("has darkMode === false at creation", () => {
      expect(useStore.getState().darkMode).toBe(false);
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

  describe("toggleDarkMode", () => {
    it("flips darkMode state", () => {
      expect(useStore.getState().darkMode).toBe(false);
      useStore.getState().toggleDarkMode();
      expect(useStore.getState().darkMode).toBe(true);
      useStore.getState().toggleDarkMode();
      expect(useStore.getState().darkMode).toBe(false);
    });

    it("sets data-theme on documentElement", () => {
      useStore.getState().toggleDarkMode();
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      useStore.getState().toggleDarkMode();
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it('persists "dark"/"light" to localStorage["theme"]', () => {
      useStore.getState().toggleDarkMode();
      expect(localStorage.getItem("theme")).toBe("dark");
      useStore.getState().toggleDarkMode();
      expect(localStorage.getItem("theme")).toBe("light");
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
});
