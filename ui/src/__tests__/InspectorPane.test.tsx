import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import type { EventMessage } from "@bindings/EventMessage";
import { render } from "@ui/test/render";
import { InspectorPane } from "@ui/components/InspectorPane";
import { useStore } from "@ui/state/store";
import { makeGetRequest, makeResponse } from "@ui/test/fixtures";

function apply(msg: unknown) {
  useStore.getState().applyEvent(msg as EventMessage);
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true);
});

describe("InspectorPane — empty state", () => {
  it("shows the placeholder when nothing is selected", () => {
    render(<InspectorPane />);
    expect(
      screen.getByText("Select a request to inspect it"),
    ).toBeInTheDocument();
  });
});

describe("InspectorPane — selected exchange", () => {
  it("renders the scaffold shell wired to the selected exchange", () => {
    apply(makeGetRequest(1, "/api/users"));
    apply(makeResponse(1, "200 OK"));
    useStore.getState().setSelectedId(1);

    render(<InspectorPane />);
    expect(screen.getByText("/api/users")).toBeInTheDocument();
    expect(screen.getByTestId("status-code")).toHaveTextContent("200");
    expect(screen.getByRole("tab", { name: "Bodies" })).toBeInTheDocument();
  });
});

describe("InspectorPane — navigation", () => {
  beforeEach(() => {
    apply(makeGetRequest(1, "/a"));
    apply(makeGetRequest(2, "/b"));
    apply(makeGetRequest(3, "/a"));
    // Oldest-first so the visible order is [1, 2, 3] and nav is deterministic.
    useStore.getState().setOrder("oldest");
  });

  it("Next selects the following exchange in order", () => {
    useStore.getState().setSelectedId(1);
    render(<InspectorPane />);
    fireEvent.click(screen.getByLabelText("Next request"));
    expect(useStore.getState().selectedId).toBe(2);
  });

  it("Previous selects the preceding exchange in order", () => {
    useStore.getState().setSelectedId(2);
    render(<InspectorPane />);
    fireEvent.click(screen.getByLabelText("Previous request"));
    expect(useStore.getState().selectedId).toBe(1);
  });

  it("next-matching jumps to the next same-method+path exchange", () => {
    // /a (id 1), /b (id 2), /a (id 3) — from id 1, next matching path "/a" is id 3
    useStore.getState().setSelectedId(1);
    render(<InspectorPane />);
    fireEvent.click(
      screen.getByLabelText("Next request with same method + path"),
    );
    expect(useStore.getState().selectedId).toBe(3);
  });
});

describe("InspectorPane — msearch gating", () => {
  it("surfaces the msearch toggle only for a bulk op on an ES/OpenSearch service", () => {
    apply(makeGetRequest(1, "/index/_msearch"));
    useStore.getState().setSelectedId(1);
    useStore.getState().setProtocol("Elasticsearch");

    render(<InspectorPane />);
    expect(screen.getByText("Raw NDJSON")).toBeInTheDocument();
  });

  it("does not surface the toggle for a plain request", () => {
    apply(makeGetRequest(1, "/api/users"));
    useStore.getState().setSelectedId(1);
    useStore.getState().setProtocol("Elasticsearch");

    render(<InspectorPane />);
    expect(screen.queryByText("Raw NDJSON")).not.toBeInTheDocument();
  });
});
