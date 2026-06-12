import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { render } from "@ui/test/render";
import { HeadersPane } from "@ui/components/headers-pane";

// Navigator clipboard mock
let mockWriteText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockWriteText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText: mockWriteText } });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("HeadersPane — subhead", () => {
  it("renders the title and a header count", () => {
    render(
      <HeadersPane
        title="Request"
        headers={[{ name: "Content-Type", value: "application/json" }]}
        emptyMessage="none"
      />,
    );
    expect(screen.getByText("Request")).toBeInTheDocument();
    expect(screen.getByText("1 header")).toBeInTheDocument();
  });

  it("pluralizes the count", () => {
    render(
      <HeadersPane
        title="Response"
        headers={[
          { name: "Content-Type", value: "application/json" },
          { name: "X-Request-Id", value: "abc" },
        ]}
        emptyMessage="none"
      />,
    );
    expect(screen.getByText("2 headers")).toBeInTheDocument();
  });
});

describe("HeadersPane — empty state", () => {
  it("shows the emptyMessage when headers array is empty", () => {
    render(
      <HeadersPane
        title="Request"
        headers={[]}
        emptyMessage="No headers here"
      />,
    );
    expect(screen.getByText("No headers here")).toBeInTheDocument();
  });

  it("does not render the search input when headers are empty", () => {
    render(
      <HeadersPane title="Request" headers={[]} emptyMessage="No headers" />,
    );
    expect(
      screen.queryByPlaceholderText("Filter headers…"),
    ).not.toBeInTheDocument();
  });
});

describe("HeadersPane — search filtering", () => {
  const headers = [
    { name: "Content-Type", value: "application/json" },
    { name: "Authorization", value: "Bearer secret" },
    { name: "X-Request-Id", value: "abc-123" },
  ];

  it("narrows visible headers when typing in the search input", () => {
    render(
      <HeadersPane title="Request" headers={headers} emptyMessage="none" />,
    );
    fireEvent.change(screen.getByPlaceholderText("Filter headers…"), {
      target: { value: "x-request" },
    });
    expect(screen.getByText("X-Request-Id")).toBeInTheDocument();
    expect(screen.queryByText("Content-Type")).not.toBeInTheDocument();
  });

  it("matches by value substring (case-insensitive)", () => {
    render(
      <HeadersPane title="Request" headers={headers} emptyMessage="none" />,
    );
    fireEvent.change(screen.getByPlaceholderText("Filter headers…"), {
      target: { value: "ABC" },
    });
    expect(screen.getByText("X-Request-Id")).toBeInTheDocument();
    expect(screen.queryByText("Content-Type")).not.toBeInTheDocument();
  });

  it("shows 'No matching headers' when filter produces no results", () => {
    render(
      <HeadersPane title="Request" headers={headers} emptyMessage="none" />,
    );
    fireEvent.change(screen.getByPlaceholderText("Filter headers…"), {
      target: { value: "zzz-no-match" },
    });
    expect(screen.getByText("No matching headers")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter headers…")).toBeInTheDocument();
  });

  it("clear button restores all headers", () => {
    render(
      <HeadersPane title="Request" headers={headers} emptyMessage="none" />,
    );
    const input = screen.getByPlaceholderText("Filter headers…");
    fireEvent.change(input, { target: { value: "content" } });
    expect(screen.queryByText("X-Request-Id")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Clear filter"));
    expect(screen.getByText("X-Request-Id")).toBeInTheDocument();
  });
});

describe("HeadersPane — pinned ordering", () => {
  it("places content-type before unpinned headers regardless of input order", () => {
    render(
      <HeadersPane
        title="Request"
        headers={[
          { name: "x-custom", value: "first" },
          { name: "content-type", value: "application/json" },
        ]}
        emptyMessage="none"
      />,
    );
    const cells = screen.getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("content-type");
  });
});

describe("HeadersPane — authorization masking", () => {
  it("displays a masked value for Authorization Bearer headers", () => {
    render(
      <HeadersPane
        title="Request"
        headers={[{ name: "authorization", value: "Bearer real-secret" }]}
        emptyMessage="none"
      />,
    );
    expect(screen.getByText("Bearer **********")).toBeInTheDocument();
    expect(screen.queryByText("Bearer real-secret")).not.toBeInTheDocument();
  });
});

describe("HeadersPane — copy button", () => {
  it("copies the raw (unmasked) value for Authorization", () => {
    render(
      <HeadersPane
        title="Request"
        headers={[{ name: "authorization", value: "Bearer real-secret" }]}
        emptyMessage="none"
      />,
    );
    fireEvent.click(screen.getByLabelText("Copy authorization value"));
    expect(mockWriteText).toHaveBeenCalledWith("Bearer real-secret");
  });

  it("copies a regular header value", () => {
    render(
      <HeadersPane
        title="Request"
        headers={[{ name: "content-type", value: "application/json" }]}
        emptyMessage="none"
      />,
    );
    fireEvent.click(screen.getByLabelText("Copy content-type value"));
    expect(mockWriteText).toHaveBeenCalledWith("application/json");
  });

  it("clears copied row state immediately when leaving the row", () => {
    render(
      <HeadersPane
        title="Request"
        headers={[{ name: "content-type", value: "application/json" }]}
        emptyMessage="none"
      />,
    );
    const copyButton = screen.getByLabelText("Copy content-type value");
    fireEvent.click(copyButton);
    expect(copyButton.querySelector(".lucide-check")).toBeInTheDocument();

    fireEvent.mouseLeave(copyButton.closest("tr")!);

    expect(copyButton.querySelector(".lucide-check")).not.toBeInTheDocument();
    expect(copyButton.querySelector(".lucide-copy")).toBeInTheDocument();
  });
});

describe("HeadersPane — credential reveal toggle", () => {
  const authHeaders = [{ name: "authorization", value: "Bearer real-secret" }];

  it("shows a reveal toggle for masked Authorization headers", () => {
    render(
      <HeadersPane title="Request" headers={authHeaders} emptyMessage="none" />,
    );
    expect(screen.getByLabelText("Reveal value")).toBeInTheDocument();
  });

  it("shows no reveal toggle for non-sensitive headers", () => {
    render(
      <HeadersPane
        title="Request"
        headers={[{ name: "content-type", value: "application/json" }]}
        emptyMessage="none"
      />,
    );
    expect(screen.queryByLabelText("Reveal value")).not.toBeInTheDocument();
  });

  it("reveals and re-hides the raw value", () => {
    render(
      <HeadersPane title="Request" headers={authHeaders} emptyMessage="none" />,
    );
    expect(screen.getByText("Bearer **********")).toBeInTheDocument();
    expect(screen.queryByText("Bearer real-secret")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Reveal value"));
    expect(screen.getByText("Bearer real-secret")).toBeInTheDocument();
    expect(screen.queryByText("Bearer **********")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Hide value"));
    expect(screen.getByText("Bearer **********")).toBeInTheDocument();
  });

  it("offers no decode toggle for a non-Basic (Bearer) credential", () => {
    render(
      <HeadersPane title="Request" headers={authHeaders} emptyMessage="none" />,
    );
    fireEvent.click(screen.getByLabelText("Reveal value"));
    expect(screen.queryByLabelText("Decode value")).not.toBeInTheDocument();
  });

  it("copies the raw (base64) value when masked or revealed", () => {
    render(
      <HeadersPane title="Request" headers={authHeaders} emptyMessage="none" />,
    );
    // Masked → copies raw.
    fireEvent.click(screen.getByLabelText("Copy authorization value"));
    expect(mockWriteText).toHaveBeenCalledWith("Bearer real-secret");
    // Revealed → still copies raw.
    fireEvent.click(screen.getByLabelText("Reveal value"));
    fireEvent.click(screen.getByLabelText("Copy authorization value"));
    expect(mockWriteText).toHaveBeenLastCalledWith("Bearer real-secret");
  });
});

describe("HeadersPane — Basic auth decode", () => {
  // "user:pass" → base64 = "dXNlcjpwYXNz"
  const basicHeaders = [{ name: "authorization", value: "Basic dXNlcjpwYXNz" }];

  it("exposes the decode toggle only after the value is revealed", () => {
    render(
      <HeadersPane
        title="Request"
        headers={basicHeaders}
        emptyMessage="none"
      />,
    );
    expect(screen.queryByLabelText("Decode value")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Reveal value"));
    expect(screen.getByLabelText("Decode value")).toBeInTheDocument();
  });

  it("cycles masked → raw → decoded → raw", () => {
    render(
      <HeadersPane
        title="Request"
        headers={basicHeaders}
        emptyMessage="none"
      />,
    );
    expect(screen.getByText("Basic **********")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Reveal value"));
    expect(screen.getByText("Basic dXNlcjpwYXNz")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Decode value"));
    expect(screen.getByText("user:pass")).toBeInTheDocument();
    expect(screen.queryByText("Basic dXNlcjpwYXNz")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Show raw value"));
    expect(screen.getByText("Basic dXNlcjpwYXNz")).toBeInTheDocument();
  });

  it("hiding from the decoded state re-masks the value", () => {
    render(
      <HeadersPane
        title="Request"
        headers={basicHeaders}
        emptyMessage="none"
      />,
    );
    fireEvent.click(screen.getByLabelText("Reveal value"));
    fireEvent.click(screen.getByLabelText("Decode value"));
    fireEvent.click(screen.getByLabelText("Hide value"));
    expect(screen.getByText("Basic **********")).toBeInTheDocument();
  });

  it("copies the decoded credential when decoded, raw otherwise", () => {
    render(
      <HeadersPane
        title="Request"
        headers={basicHeaders}
        emptyMessage="none"
      />,
    );
    fireEvent.click(screen.getByLabelText("Reveal value"));
    fireEvent.click(screen.getByLabelText("Copy authorization value"));
    expect(mockWriteText).toHaveBeenLastCalledWith("Basic dXNlcjpwYXNz");
    fireEvent.click(screen.getByLabelText("Decode value"));
    fireEvent.click(screen.getByLabelText("Copy authorization value"));
    expect(mockWriteText).toHaveBeenLastCalledWith("user:pass");
  });
});
