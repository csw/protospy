import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeadersPane } from "@ui/components/HeadersPane";

// Navigator clipboard mock
let mockWriteText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockWriteText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText: mockWriteText } });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HeadersPane — empty state", () => {
  it("shows the emptyMessage when headers array is empty", () => {
    render(<HeadersPane headers={[]} emptyMessage="No headers here" />);
    expect(screen.getByText("No headers here")).toBeInTheDocument();
  });

  it("does not render the search input when headers are empty", () => {
    render(<HeadersPane headers={[]} emptyMessage="No headers" />);
    expect(
      screen.queryByPlaceholderText("Filter headers…"),
    ).not.toBeInTheDocument();
  });
});

describe("HeadersPane — focus indicator", () => {
  const headers = [{ name: "Content-Type", value: "application/json" }];

  it("search input wrapper has focus-within:border-border-focus class", () => {
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    const wrapper = screen.getByTestId("headers-search-wrapper");
    expect(wrapper.className).toContain("focus-within:border-border-focus");
  });
});

describe("HeadersPane — basic rendering", () => {
  const headers = [
    { name: "Content-Type", value: "application/json" },
    { name: "X-Request-Id", value: "abc-123" },
  ];

  it("renders a search input with the right placeholder", () => {
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    expect(screen.getByPlaceholderText("Filter headers…")).toBeInTheDocument();
  });

  it("renders all header names and values", () => {
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    expect(screen.getByText("Content-Type")).toBeInTheDocument();
    expect(screen.getByText("application/json")).toBeInTheDocument();
    expect(screen.getByText("X-Request-Id")).toBeInTheDocument();
    expect(screen.getByText("abc-123")).toBeInTheDocument();
  });
});

describe("HeadersPane — search filtering", () => {
  const headers = [
    { name: "Content-Type", value: "application/json" },
    { name: "Authorization", value: "Bearer secret" },
    { name: "X-Request-Id", value: "abc-123" },
  ];

  it("narrows visible headers when typing in the search input", () => {
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    const input = screen.getByPlaceholderText("Filter headers…");
    fireEvent.change(input, { target: { value: "x-request" } });
    expect(screen.getByText("X-Request-Id")).toBeInTheDocument();
    expect(screen.queryByText("Content-Type")).not.toBeInTheDocument();
  });

  it("matches by value substring (case-insensitive)", () => {
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    const input = screen.getByPlaceholderText("Filter headers…");
    fireEvent.change(input, { target: { value: "ABC" } });
    expect(screen.getByText("X-Request-Id")).toBeInTheDocument();
    expect(screen.queryByText("Content-Type")).not.toBeInTheDocument();
  });

  it("shows 'No matching headers' when filter produces no results", () => {
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    const input = screen.getByPlaceholderText("Filter headers…");
    fireEvent.change(input, { target: { value: "zzz-no-match" } });
    expect(screen.getByText("No matching headers")).toBeInTheDocument();
    // Search bar should still be present
    expect(input).toBeInTheDocument();
  });

  it("shows clear button when filter is non-empty", () => {
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    expect(screen.queryByLabelText("Clear filter")).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Filter headers…"), {
      target: { value: "content" },
    });
    expect(screen.getByLabelText("Clear filter")).toBeInTheDocument();
  });

  it("clear button restores all headers", () => {
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    const input = screen.getByPlaceholderText("Filter headers…");
    fireEvent.change(input, { target: { value: "content" } });
    expect(screen.queryByText("X-Request-Id")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Clear filter"));
    expect(screen.getByText("X-Request-Id")).toBeInTheDocument();
  });

  it("clear button is a Button primitive with a visible focus ring", () => {
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    fireEvent.change(screen.getByPlaceholderText("Filter headers…"), {
      target: { value: "content" },
    });
    const clearBtn = screen.getByLabelText("Clear filter");
    expect(clearBtn).toHaveAttribute("data-slot", "button");
    expect(clearBtn.className).toContain("focus-visible:ring-ring/50");
  });
});

describe("HeadersPane — pinned header ordering", () => {
  it("places content-type before unpinned headers regardless of input order", () => {
    const headers = [
      { name: "x-custom", value: "first" },
      { name: "content-type", value: "application/json" },
    ];
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    const cells = screen.getAllByRole("cell");
    // First cell in the table should be the pinned header name
    expect(cells[0]).toHaveTextContent("content-type");
  });

  it("keeps unpinned headers in their original relative order after pinned section", () => {
    const headers = [
      { name: "x-beta", value: "b" },
      { name: "x-alpha", value: "a" },
      { name: "content-type", value: "application/json" },
    ];
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    const cells = screen.getAllByRole("cell");
    // Row 0: content-type (pinned)
    // Row 1: x-beta (unpinned, original order)
    // Row 2: x-alpha (unpinned, original order)
    expect(cells[0]).toHaveTextContent("content-type");
    // The 3rd name cell (index 4, since each row has 2 cells) is x-beta
    expect(cells[2]).toHaveTextContent("x-beta");
    expect(cells[4]).toHaveTextContent("x-alpha");
  });
});

describe("HeadersPane — authorization masking", () => {
  it("displays a masked value for Authorization Bearer headers", () => {
    const headers = [{ name: "authorization", value: "Bearer real-secret" }];
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    expect(screen.getByText("Bearer **********")).toBeInTheDocument();
    expect(screen.queryByText("Bearer real-secret")).not.toBeInTheDocument();
  });

  it("does not show a decode button for Bearer auth", () => {
    const headers = [{ name: "authorization", value: "Bearer mytoken" }];
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    expect(
      screen.queryByLabelText("Show decoded Basic auth value"),
    ).not.toBeInTheDocument();
  });
});

describe("HeadersPane — copy button", () => {
  it("copies the raw (unmasked) value when clicked for Authorization", () => {
    const headers = [{ name: "authorization", value: "Bearer real-secret" }];
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    const copyBtn = screen.getByLabelText("Copy authorization value");
    fireEvent.click(copyBtn);
    // Should copy the real value, not "Bearer **********"
    expect(mockWriteText).toHaveBeenCalledWith("Bearer real-secret");
  });

  it("copies a regular header value", () => {
    const headers = [{ name: "content-type", value: "application/json" }];
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    fireEvent.click(screen.getByLabelText("Copy content-type value"));
    expect(mockWriteText).toHaveBeenCalledWith("application/json");
  });

  it("is a Button primitive with a visible focus ring", () => {
    const headers = [{ name: "content-type", value: "application/json" }];
    render(<HeadersPane headers={headers} emptyMessage="none" />);
    const copyBtn = screen.getByLabelText("Copy content-type value");
    expect(copyBtn).toHaveAttribute("data-slot", "button");
    expect(copyBtn.className).toContain("focus-visible:ring-ring/50");
  });
});

describe("HeadersPane — Basic auth decode toggle", () => {
  // "user:pass" → base64 = "dXNlcjpwYXNz"
  const basicHeaders = [{ name: "authorization", value: "Basic dXNlcjpwYXNz" }];

  it("shows a decode button for Basic auth headers", () => {
    render(<HeadersPane headers={basicHeaders} emptyMessage="none" />);
    expect(
      screen.getByLabelText("Show decoded Basic auth value"),
    ).toBeInTheDocument();
  });

  it("decode toggle is a Button primitive with a visible focus ring", () => {
    render(<HeadersPane headers={basicHeaders} emptyMessage="none" />);
    const decodeBtn = screen.getByLabelText("Show decoded Basic auth value");
    expect(decodeBtn).toHaveAttribute("data-slot", "button");
    expect(decodeBtn.className).toContain("focus-visible:ring-ring/50");
  });

  it("reveals decoded credential when decode button is clicked", () => {
    render(<HeadersPane headers={basicHeaders} emptyMessage="none" />);
    expect(screen.queryByText("user:pass")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Show decoded Basic auth value"));
    expect(screen.getByText("user:pass")).toBeInTheDocument();
  });

  it("hides decoded credential when clicked again", () => {
    render(<HeadersPane headers={basicHeaders} emptyMessage="none" />);
    const decodeBtn = screen.getByLabelText("Show decoded Basic auth value");
    fireEvent.click(decodeBtn);
    expect(screen.getByText("user:pass")).toBeInTheDocument();
    // Now the button label changes to "Hide decoded value"
    fireEvent.click(screen.getByLabelText("Hide decoded value"));
    expect(screen.queryByText("user:pass")).not.toBeInTheDocument();
  });

  it("copy button still copies the real (unmasked) value while decoded is shown", () => {
    render(<HeadersPane headers={basicHeaders} emptyMessage="none" />);
    fireEvent.click(screen.getByLabelText("Show decoded Basic auth value"));
    fireEvent.click(screen.getByLabelText("Copy authorization value"));
    expect(mockWriteText).toHaveBeenCalledWith("Basic dXNlcjpwYXNz");
  });

  it("decoded state is not disrupted by filter changes (regression: stale-index bug)", () => {
    // Headers: authorization first (original idx 0), then x-other (idx 1).
    // After pinning, authorization is still at idx 0 in display.
    const headers = [
      { name: "authorization", value: "Basic dXNlcjpwYXNz" },
      { name: "x-other", value: "something" },
    ];
    render(<HeadersPane headers={headers} emptyMessage="none" />);

    // Decode authorization
    fireEvent.click(screen.getByLabelText("Show decoded Basic auth value"));
    expect(screen.getByText("user:pass")).toBeInTheDocument();

    // Change filter so only authorization is visible — decoded should persist
    fireEvent.change(screen.getByPlaceholderText("Filter headers…"), {
      target: { value: "authorization" },
    });
    expect(screen.getByText("user:pass")).toBeInTheDocument();

    // Clear filter — decoded should still be showing
    fireEvent.click(screen.getByLabelText("Clear filter"));
    expect(screen.getByText("user:pass")).toBeInTheDocument();
  });
});
