import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@ui/test/render";
import { BodyState } from "@ui/components/body-state";

// BodyState renders the lifecycle spinner for the loading phases only. It must
// carry aria-busy so screenshot tooling treats it as still-loading and waits
// for content before capturing (PRO-429).
describe("BodyState", () => {
  it("marks the awaiting phase aria-busy", () => {
    const { container } = render(<BodyState state={{ phase: "awaiting" }} />);
    expect(screen.getByText("Awaiting response…")).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("marks the streaming phase aria-busy", () => {
    const { container } = render(
      <BodyState state={{ phase: "streaming", partial: "" }} />,
    );
    expect(screen.getByText("Receiving body…")).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("renders nothing for the complete phase", () => {
    const { container } = render(
      <BodyState state={{ phase: "complete", text: "{}" }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
