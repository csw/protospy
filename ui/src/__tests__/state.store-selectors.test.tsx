// Unit tests for the derived selectors + the `helpOpen` slice added for the
// v2.4 chrome ingest (PRO-363): selectVisibleIds / selectSelected /
// selectTraceCount on the live store, plus the connection-model boundary mapper
// (connDotStatus) the chrome uses to feed the design-vocabulary ConnectionDot.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { EventMessage } from "@bindings/EventMessage";
import {
  useStore,
  selectVisibleIds,
  selectSelected,
  selectTraceCount,
  useVisibleExchanges,
} from "@ui/state/store";
import { connDotStatus } from "@ui/components/connection-dot";
import { makeGetRequest, makeRequestWithTrace } from "@ui/test/fixtures";

function apply(msg: unknown) {
  useStore.getState().applyEvent(msg as EventMessage);
}

describe("state/store selectors (PRO-363)", () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true);
    localStorage.clear();
    document.documentElement.removeAttribute("data-density");
  });

  describe("selectVisibleIds", () => {
    it("returns newest-first by default and oldest-first when ordered", () => {
      apply(makeGetRequest(1, "/api/alpha"));
      apply(makeGetRequest(2, "/api/beta"));
      apply(makeGetRequest(3, "/api/gamma"));

      expect(selectVisibleIds(useStore.getState())).toEqual([3, 2, 1]);

      useStore.getState().setOrder("oldest");
      expect(selectVisibleIds(useStore.getState())).toEqual([1, 2, 3]);
    });

    it("applies the text filter (uri/method/status) before ordering", () => {
      apply(makeGetRequest(1, "/api/alpha"));
      apply(makeGetRequest(2, "/api/beta"));

      useStore.getState().setFilter("beta");
      expect(selectVisibleIds(useStore.getState())).toEqual([2]);
    });

    it("restricts to the active trace filter", () => {
      apply(makeRequestWithTrace(1, "aaa", "/one"));
      apply(makeRequestWithTrace(2, "bbb", "/two"));
      apply(makeRequestWithTrace(3, "aaa", "/three"));

      useStore.getState().setTraceFilter("aaa");
      // newest-first within the trace
      expect(selectVisibleIds(useStore.getState())).toEqual([3, 1]);
    });
  });

  describe("selectSelected", () => {
    it("returns null with no selection and the exchange when selected", () => {
      apply(makeGetRequest(1, "/api/alpha"));
      expect(selectSelected(useStore.getState())).toBeNull();

      useStore.getState().setSelectedId(1);
      expect(selectSelected(useStore.getState())?.id).toBe(1);

      // a selected id that no longer exists resolves to null
      useStore.getState().setSelectedId(999);
      expect(selectSelected(useStore.getState())).toBeNull();
    });
  });

  describe("selectTraceCount", () => {
    it("counts distinct trace ids across the feed", () => {
      expect(selectTraceCount(useStore.getState())).toBe(0);
      apply(makeRequestWithTrace(1, "aaa", "/one"));
      apply(makeRequestWithTrace(2, "bbb", "/two"));
      apply(makeRequestWithTrace(3, "aaa", "/three"));
      expect(selectTraceCount(useStore.getState())).toBe(2);
    });
  });

  describe("helpOpen slice", () => {
    it("defaults closed and toggles via setHelpOpen", () => {
      expect(useStore.getState().helpOpen).toBe(false);
      useStore.getState().setHelpOpen(true);
      expect(useStore.getState().helpOpen).toBe(true);
      useStore.getState().setHelpOpen(false);
      expect(useStore.getState().helpOpen).toBe(false);
    });

    it("is session-only — not persisted to localStorage", () => {
      useStore.getState().setHelpOpen(true);
      const persisted = localStorage.getItem("protospy-ui-prefs") ?? "";
      expect(persisted).not.toContain("helpOpen");
    });
  });

  describe("useVisibleExchanges", () => {
    it("returns Exchange objects newest-first by default", () => {
      act(() => {
        apply(makeGetRequest(1, "/api/alpha"));
        apply(makeGetRequest(2, "/api/beta"));
        apply(makeGetRequest(3, "/api/gamma"));
      });

      const { result } = renderHook(() => useVisibleExchanges());
      expect(result.current.map((x) => x.id)).toEqual([3, 2, 1]);
      expect(result.current[0]).toHaveProperty("uri", "/api/gamma");
    });

    it("returns Exchange objects oldest-first when ordered", () => {
      act(() => {
        apply(makeGetRequest(1, "/api/alpha"));
        apply(makeGetRequest(2, "/api/beta"));
        useStore.getState().setOrder("oldest");
      });

      const { result } = renderHook(() => useVisibleExchanges());
      expect(result.current.map((x) => x.id)).toEqual([1, 2]);
    });

    it("applies the text filter", () => {
      act(() => {
        apply(makeGetRequest(1, "/api/alpha"));
        apply(makeGetRequest(2, "/api/beta"));
        useStore.getState().setFilter("beta");
      });

      const { result } = renderHook(() => useVisibleExchanges());
      expect(result.current).toHaveLength(1);
      expect(result.current[0]).toHaveProperty("uri", "/api/beta");
    });

    it("restricts to the active trace filter", () => {
      act(() => {
        apply(makeRequestWithTrace(1, "aaa", "/one"));
        apply(makeRequestWithTrace(2, "bbb", "/two"));
        apply(makeRequestWithTrace(3, "aaa", "/three"));
        useStore.getState().setTraceFilter("aaa");
      });

      const { result } = renderHook(() => useVisibleExchanges());
      expect(result.current.map((x) => x.id)).toEqual([3, 1]);
    });

    it("combines filter and trace filter", () => {
      act(() => {
        apply(makeRequestWithTrace(1, "aaa", "/api/foo"));
        apply(makeRequestWithTrace(2, "aaa", "/api/bar"));
        apply(makeRequestWithTrace(3, "bbb", "/api/foo"));
        useStore.getState().setTraceFilter("aaa");
        useStore.getState().setFilter("foo");
      });

      const { result } = renderHook(() => useVisibleExchanges());
      expect(result.current.map((x) => x.id)).toEqual([1]);
    });

    it("updates reactively when store changes", () => {
      const { result } = renderHook(() => useVisibleExchanges());
      expect(result.current).toHaveLength(0);

      act(() => {
        apply(makeGetRequest(1, "/api/alpha"));
        apply(makeGetRequest(2, "/api/beta"));
      });

      expect(result.current).toHaveLength(2);
    });
  });

  describe("memoization (PRO-436)", () => {
    it("returns a cached reference when inputs are unchanged", () => {
      apply(makeGetRequest(1, "/api/alpha"));
      apply(makeGetRequest(2, "/api/beta"));

      const first = selectVisibleIds(useStore.getState());
      const second = selectVisibleIds(useStore.getState());
      expect(second).toBe(first);
    });

    it("recomputes when an input changes", () => {
      apply(makeGetRequest(1, "/api/alpha"));
      apply(makeGetRequest(2, "/api/beta"));

      const before = selectVisibleIds(useStore.getState());
      useStore.getState().setFilter("beta");
      const after = selectVisibleIds(useStore.getState());
      expect(after).not.toBe(before);
      expect(after).toEqual([2]);
    });

    it("keeps useVisibleExchanges reference-stable across renders", () => {
      act(() => {
        apply(makeGetRequest(1, "/api/alpha"));
        apply(makeGetRequest(2, "/api/beta"));
      });

      const { result, rerender } = renderHook(() => useVisibleExchanges());
      const first = result.current;
      rerender();
      expect(result.current).toBe(first);
    });
  });

  describe("connDotStatus (live SSE → design dot vocabulary)", () => {
    it("passes open/connecting through and maps reconnecting → connecting", () => {
      expect(connDotStatus("open")).toBe("open");
      expect(connDotStatus("connecting")).toBe("connecting");
      expect(connDotStatus("reconnecting")).toBe("connecting");
    });
  });
});
