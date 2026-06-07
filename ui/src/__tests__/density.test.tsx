import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDensity, ROW_PX } from "@ui/lib/density";
import { useStore } from "@ui/state/store";

// useDensity is store-derived (no <DensityProvider>): it reads the `density`
// slice and returns the { density, setDensity, toggle, rowPx } shape the v2.3
// scaffolds expect. The data-density DOM write is owned by the store
// subscription and is covered in state.store.test.tsx — here we test the hook.
describe("useDensity", () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true);
    localStorage.clear();
    document.documentElement.removeAttribute("data-density");
  });

  it("reads the current density and its rowPx from the store", () => {
    const { result } = renderHook(() => useDensity());
    expect(result.current.density).toBe("regular");
    expect(result.current.rowPx).toEqual(ROW_PX.regular);
  });

  it("setDensity updates the store and re-derives rowPx", () => {
    const { result } = renderHook(() => useDensity());
    act(() => result.current.setDensity("compact"));
    expect(result.current.density).toBe("compact");
    expect(result.current.rowPx).toEqual(ROW_PX.compact);
    expect(useStore.getState().density).toBe("compact");
  });

  it("toggle flips density and back", () => {
    const { result } = renderHook(() => useDensity());
    act(() => result.current.toggle());
    expect(result.current.density).toBe("compact");
    act(() => result.current.toggle());
    expect(result.current.density).toBe("regular");
  });
});
