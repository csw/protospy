// src/lib/density.tsx — the hybrid density system, store-derived.
//
// One source of truth (the `density` slice in the Zustand store) drives THREE
// things:
//   1. CSS token swaps          — most sizing flips automatically (globals.css)
//   2. the `compact:` Tailwind variant — for the rare delta a token can't express
//   3. useDensity().rowPx       — numeric px the virtualizer needs (CSS can't hand
//                                 react-virtual a number)
//
// The `data-density` attribute on <html> is written by the single store
// subscription in `state/store.ts` (the density-ownership contract), mirroring
// the theme pattern — NOT by a React provider. `useDensity()` reads the store
// rather than a parallel context (PRO-341 review advisory), so density has one
// source of truth.
//
// Components should almost never branch on `density` in JS; rely on tokens +
// the `compact:` variant. The numbers below exist for measurement only.

import { useMemo } from "react";
import { useStore } from "@ui/state/store";

export type Density = "regular" | "compact";

/** Row heights in px, mirrored from the --row-h / --row-h-table tokens in globals.css.
 *  Keep in sync with the CSS — these are the JS-readable copy for virtualization. */
export const ROW_PX = {
  regular: { row: 74, table: 30, tableHead: 26 },
  compact: { row: 58, table: 24, tableHead: 26 },
} as const;

export interface DensityValue {
  density: Density;
  setDensity: (d: Density) => void;
  toggle: () => void;
  // PRO-341: index by Density, not the "regular" literal — under `as const`
  // the compact shape's literal heights differ, so `ROW_PX[density]` widens to
  // the union; the original `["regular"]` annotation rejected the compact shape.
  rowPx: (typeof ROW_PX)[Density];
}

/**
 * Read the current density from the store, with the same `{ density, setDensity,
 * toggle, rowPx }` shape the scaffolds expect. No `<DensityProvider>` is needed
 * — density lives in the store and the `data-density` DOM write is owned by the
 * store subscription in `state/store.ts`.
 */
export function useDensity(): DensityValue {
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  return useMemo(
    () => ({
      density,
      setDensity,
      toggle: () => setDensity(density === "regular" ? "compact" : "regular"),
      rowPx: ROW_PX[density],
    }),
    [density, setDensity],
  );
}
