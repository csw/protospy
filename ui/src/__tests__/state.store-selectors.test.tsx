// Unit tests for the derived selectors + the `helpOpen` slice added for the
// v2.4 chrome ingest (PRO-363): selectVisibleIds / selectSelected /
// selectTraceCount on the live store, plus the connection-model boundary mapper
// (connDotStatus) the chrome uses to feed the design-vocabulary ConnectionDot.

import { describe, it, expect, beforeEach } from "vitest";
import type { EventMessage } from "@bindings/EventMessage";
import {
  useStore,
  selectVisibleIds,
  selectSelected,
  selectTraceCount,
} from "@ui/state/store";
import { connDotStatus } from "@ui/components/protospy/connection-dot";
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

  describe("connDotStatus (live SSE → design dot vocabulary)", () => {
    it("passes open/connecting through and maps reconnecting → connecting", () => {
      expect(connDotStatus("open")).toBe("open");
      expect(connDotStatus("connecting")).toBe("connecting");
      expect(connDotStatus("reconnecting")).toBe("connecting");
    });
  });
});
