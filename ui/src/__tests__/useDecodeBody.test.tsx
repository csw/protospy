import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import { useDecodeBody } from "@ui/hooks/useDecodeBody";
import type { BodyState } from "@ui/state/reducer";
import { decodeBody, type DecodeResult } from "@ui/body/decode";

vi.mock("@ui/body/decode", () => ({
  decodeBody: vi.fn(),
}));

const decodeBodyMock = vi.mocked(decodeBody);

function makeBody(overrides: Partial<BodyState> = {}): BodyState {
  return {
    chunks: [],
    atEnd: true,
    totalBytes: 0,
    ...overrides,
  };
}

const sampleResult: DecodeResult = {
  kind: "text",
  text: "ok",
  mediaType: "text/plain",
  size: 2,
};

describe("useDecodeBody", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    decodeBodyMock.mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
  });

  it("returns { loading: false, result: null } when body is undefined", () => {
    const { result } = renderHook(() => useDecodeBody(undefined));
    expect(result.current).toEqual({ loading: false, result: null });
    expect(decodeBodyMock).not.toHaveBeenCalled();
  });

  it("returns { loading: false, result: null } when body is streaming (atEnd === false)", () => {
    const body = makeBody({ atEnd: false });
    const { result } = renderHook(() => useDecodeBody(body));
    expect(result.current).toEqual({ loading: false, result: null });
    expect(decodeBodyMock).not.toHaveBeenCalled();
  });

  it("returns loading then resolved result when decodeBody resolves", async () => {
    decodeBodyMock.mockResolvedValueOnce(sampleResult);
    const body = makeBody({ atEnd: true });

    const { result } = renderHook(() => useDecodeBody(body));

    // First render: decode kicked off in effect, hook reports loading.
    expect(result.current).toEqual({ loading: true, result: null });

    await waitFor(() => {
      expect(result.current).toEqual({ loading: false, result: sampleResult });
    });
    expect(decodeBodyMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("returns { loading: false, result: null } when decodeBody rejects", async () => {
    decodeBodyMock.mockRejectedValueOnce(new Error("boom"));
    const body = makeBody({ atEnd: true });

    const { result } = renderHook(() => useDecodeBody(body));
    expect(result.current).toEqual({ loading: true, result: null });

    await waitFor(() => {
      expect(result.current).toEqual({ loading: false, result: null });
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("drops a stale decode when the body changes mid-flight", async () => {
    let resolveFirst!: (r: DecodeResult) => void;
    let resolveSecond!: (r: DecodeResult) => void;

    decodeBodyMock.mockImplementationOnce(
      () =>
        new Promise<DecodeResult>((r) => {
          resolveFirst = r;
        }),
    );
    decodeBodyMock.mockImplementationOnce(
      () =>
        new Promise<DecodeResult>((r) => {
          resolveSecond = r;
        }),
    );

    const firstBody = makeBody({ atEnd: true, totalBytes: 1 });
    const secondBody = makeBody({ atEnd: true, totalBytes: 2 });

    const staleResult: DecodeResult = {
      kind: "text",
      text: "stale",
      mediaType: "text/plain",
      size: 1,
    };
    const freshResult: DecodeResult = {
      kind: "text",
      text: "fresh",
      mediaType: "text/plain",
      size: 2,
    };

    const { result, rerender } = renderHook(
      ({ body }: { body: BodyState }) => useDecodeBody(body),
      { initialProps: { body: firstBody } },
    );

    expect(result.current).toEqual({ loading: true, result: null });

    // Swap to a new body before the first decode resolves.
    rerender({ body: secondBody });
    expect(result.current).toEqual({ loading: true, result: null });

    // Resolve the stale first decode — its result must be discarded.
    await act(async () => {
      resolveFirst(staleResult);
    });
    expect(result.current).toEqual({ loading: true, result: null });

    // Resolve the latest decode — that result must be exposed.
    await act(async () => {
      resolveSecond(freshResult);
    });
    expect(result.current).toEqual({ loading: false, result: freshResult });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("does not setState after unmount while a decode is in flight", async () => {
    let resolve!: (r: DecodeResult) => void;
    decodeBodyMock.mockImplementationOnce(
      () =>
        new Promise<DecodeResult>((r) => {
          resolve = r;
        }),
    );
    const body = makeBody({ atEnd: true });

    const { result, unmount } = renderHook(() => useDecodeBody(body));
    expect(result.current).toEqual({ loading: true, result: null });

    unmount();

    // Resolve after unmount — the cancellation flag should prevent setState.
    await act(async () => {
      resolve(sampleResult);
    });

    // React logs an "act" warning or "setState on unmounted" to console.error
    // when this misbehaves; the cancellation flag should silence that.
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
