import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { EventMessage } from "@bindings/EventMessage";
import { FilterBar } from "@ui/components/FilterBar";
import { useStore } from "@ui/state/store";
import { makeGetRequest, makeRequestWithTrace } from "@ui/test/fixtures";
import { shortenTraceId } from "@ui/lib/utils";

describe("FilterBar", () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true);
  });

  describe("filter input", () => {
    it("dispatches setFilter on each keystroke", () => {
      render(<FilterBar />);
      const input = screen.getByPlaceholderText(
        "Filter requests…",
      ) as HTMLInputElement;

      fireEvent.change(input, { target: { value: "G" } });
      expect(useStore.getState().filter).toBe("G");
      expect(input).toHaveValue("G");

      fireEvent.change(input, { target: { value: "GE" } });
      expect(useStore.getState().filter).toBe("GE");
      expect(input).toHaveValue("GE");

      fireEvent.change(input, { target: { value: "GET" } });
      expect(useStore.getState().filter).toBe("GET");
      expect(input).toHaveValue("GET");
    });
  });

  describe("clear button", () => {
    it("is not rendered when filter is empty", () => {
      render(<FilterBar />);
      expect(screen.queryByLabelText("Clear filter")).not.toBeInTheDocument();
    });

    it("is rendered when filter is non-empty", () => {
      useStore.getState().setFilter("hello");
      render(<FilterBar />);
      expect(screen.getByLabelText("Clear filter")).toBeInTheDocument();
    });

    it("clears the filter when clicked", () => {
      useStore.getState().setFilter("hello");
      render(<FilterBar />);
      const clearBtn = screen.getByLabelText("Clear filter");
      fireEvent.click(clearBtn);
      expect(useStore.getState().filter).toBe("");
      expect(screen.queryByLabelText("Clear filter")).not.toBeInTheDocument();
    });

    it("is a Button primitive with a visible focus ring", () => {
      useStore.getState().setFilter("hello");
      render(<FilterBar />);
      const clearBtn = screen.getByLabelText("Clear filter");
      expect(clearBtn).toHaveAttribute("data-slot", "button");
      expect(clearBtn.className).toContain("focus-visible:ring-ring/50");
    });
  });

  describe("traceFilter chip", () => {
    const TRACE_ID = "abcdef0123456789abcdef0123456789";

    it("is not rendered when traceFilter is null", () => {
      render(<FilterBar />);
      expect(
        screen.queryByLabelText("Clear trace filter"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/^trace /)).not.toBeInTheDocument();
    });

    it("renders with the shortened trace id when traceFilter is set", () => {
      useStore.getState().setTraceFilter(TRACE_ID);
      render(<FilterBar />);
      expect(screen.getByLabelText("Clear trace filter")).toBeInTheDocument();
      expect(
        screen.getByText(`trace ${shortenTraceId(TRACE_ID)}`),
      ).toBeInTheDocument();
    });

    it("clears traceFilter back to null when the chip's clear button is clicked", () => {
      useStore.getState().setTraceFilter(TRACE_ID);
      render(<FilterBar />);
      const clearBtn = screen.getByLabelText("Clear trace filter");
      fireEvent.click(clearBtn);
      expect(useStore.getState().traceFilter).toBeNull();
      expect(
        screen.queryByLabelText("Clear trace filter"),
      ).not.toBeInTheDocument();
    });

    it("clear button is a Button primitive with a visible focus ring", () => {
      useStore.getState().setTraceFilter(TRACE_ID);
      render(<FilterBar />);
      const clearBtn = screen.getByLabelText("Clear trace filter");
      expect(clearBtn).toHaveAttribute("data-slot", "button");
      expect(clearBtn.className).toContain("focus-visible:ring-ring/50");
    });
  });

  describe("focus indicator", () => {
    it("filter input wrapper has focus-within:border-border-focus class", () => {
      render(<FilterBar />);
      const wrapper = screen.getByTestId("filter-input-wrapper");
      expect(wrapper.className).toContain("focus-within:border-border-focus");
    });
  });

  describe("count display", () => {
    it("shows 'N requests' (pluralised) when no filter and N > 1", () => {
      useStore
        .getState()
        .applyEvent(makeGetRequest(1) as unknown as EventMessage);
      useStore
        .getState()
        .applyEvent(makeGetRequest(2, "/api/other") as unknown as EventMessage);
      render(<FilterBar />);
      expect(screen.getByText("2 requests")).toBeInTheDocument();
    });

    it("shows '1 request' (singular) when no filter and N === 1", () => {
      useStore
        .getState()
        .applyEvent(makeGetRequest(1) as unknown as EventMessage);
      render(<FilterBar />);
      expect(screen.getByText("1 request")).toBeInTheDocument();
    });

    it("shows '0 requests' when there are no exchanges", () => {
      render(<FilterBar />);
      expect(screen.getByText("0 requests")).toBeInTheDocument();
    });

    it("shows 'M of N' when filtering", () => {
      useStore
        .getState()
        .applyEvent(makeGetRequest(1, "/api/test") as unknown as EventMessage);
      useStore
        .getState()
        .applyEvent(makeGetRequest(2, "/api/other") as unknown as EventMessage);
      useStore.getState().setFilter("test");
      render(<FilterBar />);
      expect(screen.getByText("1 of 2")).toBeInTheDocument();
    });

    it("shows 'M of N' when traceFilter is set", () => {
      const traceA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      useStore
        .getState()
        .applyEvent(
          makeRequestWithTrace(1, traceA, "/api/a") as unknown as EventMessage,
        );
      useStore
        .getState()
        .applyEvent(makeGetRequest(2, "/api/b") as unknown as EventMessage);
      useStore.getState().setTraceFilter(traceA);
      render(<FilterBar />);
      expect(screen.getByText("1 of 2")).toBeInTheDocument();
    });

    it("shows intersection count when both text filter and traceFilter are set", () => {
      const traceA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      useStore
        .getState()
        .applyEvent(
          makeRequestWithTrace(1, traceA, "/api/a") as unknown as EventMessage,
        );
      useStore
        .getState()
        .applyEvent(
          makeRequestWithTrace(2, traceA, "/api/b") as unknown as EventMessage,
        );
      useStore
        .getState()
        .applyEvent(makeGetRequest(3, "/api/a") as unknown as EventMessage);
      useStore.getState().setFilter("/api/a");
      useStore.getState().setTraceFilter(traceA);
      render(<FilterBar />);
      expect(screen.getByText("1 of 3")).toBeInTheDocument();
    });
  });
});
