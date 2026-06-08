import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveIndicator, deriveStreamState } from "@ui/components/LiveIndicator";

describe("deriveStreamState", () => {
  it("returns 'complete' when atEnd is true", () => {
    expect(deriveStreamState(true, true)).toBe("complete");
    expect(deriveStreamState(true, false)).toBe("complete");
  });

  it("returns 'live' when streaming and following", () => {
    expect(deriveStreamState(false, true)).toBe("live");
  });

  it("returns 'paused' when streaming and not following", () => {
    expect(deriveStreamState(false, false)).toBe("paused");
  });

  it("returns 'disconnected' for Response-direction error on open stream", () => {
    const error = { direction: "Response" as const, message: "reset" };
    expect(deriveStreamState(false, true, error)).toBe("disconnected");
    expect(deriveStreamState(false, false, error)).toBe("disconnected");
  });

  it("returns 'complete' when atEnd is true even with Response error", () => {
    const error = { direction: "Response" as const, message: "reset" };
    expect(deriveStreamState(true, false, error)).toBe("complete");
  });

  it("ignores Request-direction errors", () => {
    const error = { direction: "Request" as const, message: "refused" };
    expect(deriveStreamState(false, true, error)).toBe("live");
    expect(deriveStreamState(false, false, error)).toBe("paused");
  });
});

describe("LiveIndicator", () => {
  it("shows 'complete' with gray dot", () => {
    render(<LiveIndicator state="complete" />);
    expect(screen.getByText("complete")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-muted-foreground");
    expect(dot).not.toHaveClass("animate-pulse");
  });

  it("shows 'live' with green pulsing dot", () => {
    render(<LiveIndicator state="live" />);
    expect(screen.getByText("live")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-ok");
    expect(dot).toHaveClass("animate-pulse");
  });

  it("shows 'paused' with amber static dot", () => {
    render(<LiveIndicator state="paused" />);
    expect(screen.getByText("paused")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-redirect");
    expect(dot).not.toHaveClass("animate-pulse");
  });

  it("shows 'disconnected' with red static dot", () => {
    render(<LiveIndicator state="disconnected" />);
    expect(screen.getByText("disconnected")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-error");
    expect(dot).not.toHaveClass("animate-pulse");
    expect(dot).not.toHaveClass("bg-ok");
    expect(dot).not.toHaveClass("bg-redirect");
  });
});
