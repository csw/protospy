// src/lib/density.tsx — the hybrid density system.
//
// One source of truth (the data-density attribute on <html>) drives THREE things:
//   1. CSS token swaps          — most sizing flips automatically (globals.css)
//   2. the `compact:` Tailwind variant — for the rare delta a token can't express
//   3. useDensity().rowPx       — numeric px the virtualizer needs (CSS can't hand
//                                 react-virtual a number)
//
// Components should almost never branch on `density` in JS; rely on tokens +
// the `compact:` variant. The numbers below exist for measurement only.

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Density = "regular" | "compact";

/** Row heights in px, mirrored from the --row-h / --row-h-table tokens in globals.css.
 *  Keep in sync with the CSS — these are the JS-readable copy for virtualization. */
export const ROW_PX = {
  regular: { row: 74, table: 30, tableHead: 26 },
  compact: { row: 58, table: 24, tableHead: 26 },
} as const;

interface DensityContextValue {
  density: Density;
  setDensity: (d: Density) => void;
  toggle: () => void;
  // PRO-341: index by Density, not the "regular" literal — under `as const`
  // the compact shape's literal heights differ, so `ROW_PX[density]` widens to
  // the union; the original `["regular"]` annotation rejected the compact shape.
  rowPx: (typeof ROW_PX)[Density];
}

const DensityContext = createContext<DensityContextValue | null>(null);

export function DensityProvider({
  children,
  defaultDensity = "regular",
}: {
  children: ReactNode;
  defaultDensity?: Density;
}) {
  const [density, setDensity] = useState<Density>(defaultDensity);

  // The attribute is the mechanism the token swaps + `compact:` variant key off.
  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  const value = useMemo<DensityContextValue>(
    () => ({
      density,
      setDensity,
      toggle: () =>
        setDensity((d) => (d === "regular" ? "compact" : "regular")),
      rowPx: ROW_PX[density],
    }),
    [density],
  );

  return (
    <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
  );
}

export function useDensity(): DensityContextValue {
  const ctx = useContext(DensityContext);
  if (!ctx) throw new Error("useDensity must be used within <DensityProvider>");
  return ctx;
}
