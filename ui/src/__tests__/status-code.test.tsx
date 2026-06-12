import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@ui/test/render";
import { StatusCode } from "@ui/components/status-code";

describe("StatusCode", () => {
  it("renders a 200 OK code with text-ok", () => {
    render(<StatusCode status="200 OK" />);
    const el = screen.getByTestId("status-code");
    expect(el).toHaveTextContent("200");
    expect(el).toHaveClass("text-ok");
  });

  it("renders a 500 code with text-server", () => {
    render(<StatusCode status="500 Internal Server Error" />);
    expect(screen.getByTestId("status-code")).toHaveClass("text-server");
  });

  it("renders pending (no status) with text-pending", () => {
    render(<StatusCode status={undefined} />);
    expect(screen.getByTestId("status-code")).toHaveClass("text-pending");
  });

  it("renders a pure transport error as an 'Error' badge chip with status-namespace token treatment", () => {
    render(<StatusCode status={undefined} hasError />);
    const el = screen.getByTestId("status-code");
    expect(el).toHaveTextContent("Error");
    expect(el).toHaveAttribute("data-slot", "badge");
    expect(el).toHaveClass("text-error");
    expect(el).toHaveClass("bg-error-bg");
    expect(el).toHaveAttribute("data-error");
  });

  it("renders a mid-stream error (status present + hasError) with text-client warning tone, not text-error", () => {
    render(<StatusCode status="200 OK" hasError />);
    const el = screen.getByTestId("status-code");
    expect(el).toHaveTextContent("200 ✕");
    expect(el).toHaveClass("text-client");
    expect(el).not.toHaveClass("text-error");
    expect(el).toHaveAttribute("data-error");
  });

  it("mid-stream error on a non-200 status also uses text-client warning tone", () => {
    render(<StatusCode status="500 Internal Server Error" hasError />);
    const el = screen.getByTestId("status-code");
    expect(el).toHaveTextContent("500 ✕");
    expect(el).toHaveClass("text-client");
    expect(el).not.toHaveClass("text-error");
  });

  it("full mode renders the complete status line in rows mode", () => {
    render(<StatusCode status="404 Not Found" full />);
    expect(screen.getByTestId("status-code")).toHaveTextContent(
      "404 Not Found",
    );
  });
});
