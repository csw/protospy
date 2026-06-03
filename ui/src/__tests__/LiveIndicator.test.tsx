import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveIndicator } from "@ui/components/LiveIndicator";

describe("LiveIndicator", () => {
  it("shows 'complete' with gray dot when atEnd is true", () => {
    render(<LiveIndicator atEnd={true} isFollowing={true} />);
    expect(screen.getByText("complete")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-mid");
    expect(dot).not.toHaveClass("bg-green");
    expect(dot).not.toHaveClass("bg-amber");
    expect(dot).not.toHaveClass("animate-pulse");
  });

  it("complete state ignores isFollowing", () => {
    render(<LiveIndicator atEnd={true} isFollowing={false} />);
    expect(screen.getByText("complete")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-mid");
  });

  it("shows 'live' with green pulsing dot when streaming and following", () => {
    render(<LiveIndicator atEnd={false} isFollowing={true} />);
    expect(screen.getByText("live")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-green");
    expect(dot).toHaveClass("animate-pulse");
    expect(dot).not.toHaveClass("bg-amber");
  });

  it("shows 'paused' with amber static dot when streaming and not following", () => {
    render(<LiveIndicator atEnd={false} isFollowing={false} />);
    expect(screen.getByText("paused")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-amber");
    expect(dot).not.toHaveClass("animate-pulse");
    expect(dot).not.toHaveClass("bg-green");
  });
});
