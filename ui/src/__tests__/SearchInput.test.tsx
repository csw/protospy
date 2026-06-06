import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchInput } from "@ui/components/ui/SearchInput";

describe("SearchInput", () => {
  it("renders the placeholder and current value", () => {
    render(
      <SearchInput
        value="hello"
        onChange={() => {}}
        placeholder="Filter requests…"
      />,
    );
    const input = screen.getByPlaceholderText(
      "Filter requests…",
    ) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("hello");
  });

  it("calls onChange with the new value as the user types", () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} placeholder="Search" />);
    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "abc" },
    });
    expect(onChange).toHaveBeenCalledWith("abc");
  });

  it("hides the clear button when the value is empty", () => {
    render(<SearchInput value="" onChange={() => {}} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the clear button when there is a value", () => {
    render(<SearchInput value="x" onChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: "Clear filter" }),
    ).toBeInTheDocument();
  });

  it("clears the value when the clear button is clicked", () => {
    const onChange = vi.fn();
    render(<SearchInput value="x" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("uses a custom clearLabel for the clear button's accessible name", () => {
    render(
      <SearchInput value="x" onChange={() => {}} clearLabel="Clear headers" />,
    );
    expect(
      screen.getByRole("button", { name: "Clear headers" }),
    ).toBeInTheDocument();
  });

  it("applies data-testid and extra className to the wrapper", () => {
    render(
      <SearchInput
        value=""
        onChange={() => {}}
        data-testid="filter-input-wrapper"
        className="flex-1"
      />,
    );
    const wrapper = screen.getByTestId("filter-input-wrapper");
    expect(wrapper).toHaveClass("flex-1");
    // The wrapper owns the focus-within affordance, not the inner input.
    expect(wrapper).toHaveClass("focus-within:border-border-focus");
  });
});
