/**
 * Layout constants for the `AppShell` list/inspector resizable split.
 *
 * Kept in a React-free module (no imports) so they are the single source of
 * truth shared by both `AppShell` and the `browser/layout.spec.ts` Playwright
 * tests — the tests import these directly rather than re-hardcoding the numbers,
 * so a bound change can't silently drift from the assertions that guard it.
 */

/** Default list-pane widths (px) by mode — must match the store defaults. */
export const DEFAULT_LIST_WIDTH = { rows: 340, table: 720 } as const;

/**
 * List/inspector pane size bounds passed to `react-resizable-panels`.
 *
 * These are the real guard against the too-narrow / too-wide failure modes —
 * a visual review can flag clipping, but only the panel `minSize`/`maxSize`
 * constraints actually prevent it (drag, double-click, and persisted-width
 * restore all flow through them).
 *
 * - `LIST_MIN_WIDTH` (px, per mode): floor for the list pane. Mode-dependent
 *   because the two modes have very different intrinsic minimum widths:
 *   - **rows** (280px): ensures the timestamp in row 1 of `ExchangeListItem`
 *     doesn't clip behind the resize separator.
 *   - **table** (480px): ensures all six grid columns (METHOD 54 + STATUS 42 +
 *     PATH minmax(100,1fr) + TIME 54 + SIZE 120 + WHEN 88 = 458px intrinsic
 *     minimum) remain visible. The extra ~20px absorbs the 3px border-l on
 *     each row, the 1px border-r on the list container, and the trace rail
 *     (12px) when present. Without this floor the WHEN (timestamp) column
 *     was hidden behind the separator — the clipping that PRO-275 fixes.
 * - `LIST_MAX_WIDTH` (% of the group): cap so the list can't be dragged so wide
 *   it dominates the viewport and starves the inspector. A percentage (not px)
 *   keeps the cap viewport-relative across the 1280/1440/1920 review widths.
 *   (The panel Group spans the full window width, so the group is effectively
 *   the viewport minus the 1px separator.)
 * - `INSPECTOR_MIN_WIDTH` (px): floor for the inspector pane so its content
 *   (headers split, bodies, timing) can't be collapsed to near-zero. This is
 *   the guard called out in the PRO-234 review; without it the inspector Panel
 *   fell back to the library's built-in floor.
 *
 * The bounds are mutually consistent at the narrowest supported width (1280px):
 * `LIST_MIN_WIDTH.table` (480) + `INSPECTOR_MIN_WIDTH` (400) + 1 (separator)
 * = 881 < 1280, so both floors can be honored simultaneously. `LIST_MAX_WIDTH`
 * (≈832px at 1280) leaves ≈447px for the inspector, above `INSPECTOR_MIN_WIDTH`.
 * Both constraints only stay consistent while the group is wider than ≈1143px
 * (`INSPECTOR_MIN_WIDTH / (1 - 0.65)`); below that the px floor and the % cap
 * would fight. The app is desktop-only at ≥1280px, so this holds — but if the
 * minimum supported width is ever lowered past ≈1143px, revisit these values
 * together.
 */
export const LIST_MIN_WIDTH = { rows: 280, table: 480 } as const;
export const LIST_MAX_WIDTH = "65%" as const;
export const INSPECTOR_MIN_WIDTH = 400;
