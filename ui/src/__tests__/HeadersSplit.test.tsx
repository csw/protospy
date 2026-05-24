import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HeadersSplit } from "@ui/components/HeadersSplit";

afterEach(() => {
  cleanup();
});

const reqHeaders = [
  { name: "content-type", value: "application/json" },
  { name: "x-req-header", value: "req-val" },
];

const resHeaders = [
  { name: "content-type", value: "text/html" },
  { name: "x-res-header", value: "res-val" },
];

describe("HeadersSplit — panel titles", () => {
  it("renders a Request panel and a Response panel", () => {
    render(<HeadersSplit reqHeaders={reqHeaders} resHeaders={resHeaders} />);
    expect(screen.getByText("Request")).toBeInTheDocument();
    expect(screen.getByText("Response")).toBeInTheDocument();
  });
});

describe("HeadersSplit — header counts", () => {
  it("shows correct plural count in request panel", () => {
    render(<HeadersSplit reqHeaders={reqHeaders} resHeaders={resHeaders} />);
    const reqPanel = screen.getByTestId("headers-panel-request");
    expect(reqPanel).toHaveTextContent("2 headers");
  });

  it("shows correct singular count in response panel (1 header)", () => {
    render(
      <HeadersSplit
        reqHeaders={reqHeaders}
        resHeaders={[{ name: "content-type", value: "text/plain" }]}
      />,
    );
    const resPanel = screen.getByTestId("headers-panel-response");
    expect(resPanel).toHaveTextContent("1 header");
  });
});

describe("HeadersSplit — panel content isolation", () => {
  it("shows request headers in request panel", () => {
    render(<HeadersSplit reqHeaders={reqHeaders} resHeaders={resHeaders} />);
    const reqPanel = screen.getByTestId("headers-panel-request");
    expect(reqPanel).toHaveTextContent("x-req-header");
    expect(reqPanel).toHaveTextContent("req-val");
  });

  it("shows response headers in response panel", () => {
    render(<HeadersSplit reqHeaders={reqHeaders} resHeaders={resHeaders} />);
    const resPanel = screen.getByTestId("headers-panel-response");
    expect(resPanel).toHaveTextContent("x-res-header");
    expect(resPanel).toHaveTextContent("res-val");
  });
});

describe("HeadersSplit — empty states", () => {
  it("shows empty message in request panel when no request headers", () => {
    render(<HeadersSplit reqHeaders={[]} resHeaders={resHeaders} />);
    const reqPanel = screen.getByTestId("headers-panel-request");
    expect(reqPanel).toHaveTextContent("No request headers captured");
  });

  it("shows empty message in response panel when no response headers", () => {
    render(<HeadersSplit reqHeaders={reqHeaders} resHeaders={[]} />);
    const resPanel = screen.getByTestId("headers-panel-response");
    expect(resPanel).toHaveTextContent("No response headers captured");
  });
});
