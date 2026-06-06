import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState, emptyStateText } from "@ui/components/ui/EmptyState";

describe("EmptyState", () => {
  it("renders children with the base treatment and the xs size token by default", () => {
    render(<EmptyState>No body</EmptyState>);
    const text = screen.getByText("No body");
    // Design-token sizes, not bare Tailwind defaults (design-system §2.4).
    expect(text).toHaveClass(
      "text-dim",
      "font-ui",
      "uppercase",
      "tracking-widest",
      "text-ui-xs",
    );
    expect(text).not.toHaveClass("text-xs", "text-sm");
  });

  it("uses the text-ui (13px) token for the sm size", () => {
    render(<EmptyState textSize="sm">Select a request</EmptyState>);
    const text = screen.getByText("Select a request");
    expect(text).toHaveClass("text-ui");
    expect(text).not.toHaveClass("text-ui-xs", "text-sm");
  });

  it("exports the shared empty-state text treatment for non-cmdk callers", () => {
    // Consumed by the command palette's CommandEmpty so the look stays in sync
    // with EmptyState without sharing a wrapper component.
    expect(emptyStateText).toContain("font-ui");
    expect(emptyStateText).toContain("text-ui-xs");
    expect(emptyStateText).not.toMatch(/\btext-xs\b/);
  });
});
