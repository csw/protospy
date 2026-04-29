import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeToEvents } from "../api/sse";

class MockEventSource {
  static last: MockEventSource;

  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, ((e: { data: string }) => void)[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.last = this;
  }

  addEventListener(type: string, handler: (e: { data: string }) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(handler);
    this.listeners.set(type, existing);
  }

  emit(type: string, data: string) {
    for (const h of this.listeners.get(type) ?? []) h({ data });
  }

  close() {
    this.closed = true;
  }
}

describe("subscribeToEvents", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates EventSource with the correct URL", () => {
    subscribeToEvents("es", vi.fn(), vi.fn());
    expect(MockEventSource.last.url).toBe("/service/es/events");
  });

  it("percent-encodes special characters in the service name", () => {
    subscribeToEvents("my service/v2", vi.fn(), vi.fn());
    expect(MockEventSource.last.url).toBe("/service/my%20service%2Fv2/events");
  });

  it("emits 'connecting' immediately on subscribe", () => {
    const onStatusChange = vi.fn();
    subscribeToEvents("es", vi.fn(), onStatusChange);
    expect(onStatusChange).toHaveBeenCalledWith("connecting");
  });

  it("emits 'open' when the connection opens", () => {
    const onStatusChange = vi.fn();
    subscribeToEvents("es", vi.fn(), onStatusChange);
    MockEventSource.last.onopen?.();
    expect(onStatusChange).toHaveBeenLastCalledWith("open");
  });

  it("emits 'reconnecting' on error", () => {
    const onStatusChange = vi.fn();
    subscribeToEvents("es", vi.fn(), onStatusChange);
    MockEventSource.last.onerror?.();
    expect(onStatusChange).toHaveBeenLastCalledWith("reconnecting");
  });

  it("parses and delivers exchange-report events", () => {
    const onMessage = vi.fn();
    subscribeToEvents("es", onMessage, vi.fn());
    const msg = {
      exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" },
      direction: "Request",
      event: {
        type: "Request",
        method: "GET",
        uri: "/",
        version: "HTTP/1.1",
        headers: {},
        body: { type: "NoBody" },
      },
    };
    MockEventSource.last.emit("exchange-report", JSON.stringify(msg));
    expect(onMessage).toHaveBeenCalledWith(msg);
  });

  it("silently ignores malformed exchange-report JSON", () => {
    const onMessage = vi.fn();
    subscribeToEvents("es", onMessage, vi.fn());
    expect(() =>
      MockEventSource.last.emit("exchange-report", "not json"),
    ).not.toThrow();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("closes the EventSource when the cleanup function is called", () => {
    const cleanup = subscribeToEvents("es", vi.fn(), vi.fn());
    cleanup();
    expect(MockEventSource.last.closed).toBe(true);
  });
});
