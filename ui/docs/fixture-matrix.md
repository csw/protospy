# Fixture matrix

The fixture matrix is the set of deterministic UI states the visual-review
workflow ([PRO-229](https://linear.app/protospy/issue/PRO-229)) walks. Every
cell is reachable by **store injection** — no live traffic — so a reviewer (or
the PRO-235 review subagent) can render each meaningful state reproducibly at
each supported width.

The canonical definitions live in [`src/test/scenes.ts`](../src/test/scenes.ts).
Each _scene_ bundles the `EventMessage`s to inject plus the store configuration
(selection, connection, view mode, density, decoded-size caches) needed to reach
its cell. The same definitions drive both consumers:

- **Browser test suite** — `browser/fixture-matrix.spec.ts` imports `SCENES` /
  `applySceneToStore` and asserts every cell renders at every width with no
  console errors.
- **Visual-review subagent** — drives a running dev server through the dev-only
  `window.__test_scenes` harness (installed by `main.tsx`, mirroring
  `window.__test_store`).

## Reaching a cell

Run the dev server (`pnpm dev`) and inject a scene by id from the page:

```js
window.__test_scenes.apply("dual-size"); // resets the store, then applies the cell
window.__test_scenes.list(); // metadata for every scene, in matrix order
window.__test_scenes.widths; // [1280, 1440, 1920]
```

`apply` returns `false` for an unknown id. The harness exists only in dev
builds; the dynamic import is dead-code-eliminated from production.

Inspect each cell at the three supported widths — **1280** (minimum), **1440**
(baseline), **1920** (wide). Below 1280 is unsupported.

## The matrix

### State axis

| Scene id    | Cell            | Notes                                                                   |
| ----------- | --------------- | ----------------------------------------------------------------------- |
| `empty`     | Empty list      | "No requests yet" empty state; status bar shows `connected`.            |
| `loading`   | Loading         | No exchanges, connection `connecting` (amber pulse).                    |
| `error-row` | Error row (ERR) | Upstream failure → red `ERR` badge; selected so the inspector shows it. |
| `selected`  | Selected        | Populated list, one row selected; inspector populated.                  |
| `hover`     | Row hover       | Populated list; **hover a row** (CSS `:hover`, not store-injectable).   |

### Data-size axis

| Scene id     | Cell                   | Notes                                                              |
| ------------ | ---------------------- | ------------------------------------------------------------------ |
| `long-uri`   | Long URI + query       | Deep path + long query string; check truncation / `title` tooltip. |
| `long-error` | Long error text        | Verbose hyper-style error chain.                                   |
| `many-rows`  | Many rows (120)        | Virtualization, scroll, status-bar count.                          |
| `dual-size`  | Dual wire/decoded size | gzip response; list shows `66B/58B (gzip)`; hover for the tooltip. |

There is intentionally **no long-status cell**. HTTP status phrases are short by
design (200/302/404/500/502 dominate real traffic; even exotic codes carry short
reason phrases), so a fabricated 100-character phrase would test a state that
never occurs. Status-column truncation, if it needs coverage, should be driven
by a realistic three-digit code clipping in a very narrow column — not an
invented long phrase. See the note near the data-extreme fixtures in
`src/test/fixtures.ts`.

### View axis

| Scene id        | Cell                    | Notes                                  |
| --------------- | ----------------------- | -------------------------------------- |
| `table-mode`    | Table mode              | Columnar list (vs. default rows mode). |
| `compact-rows`  | Compact density (rows)  | Tighter row height.                    |
| `compact-table` | Compact density (table) | Tightest row height.                   |

### Cross-axis (view × data combinations)

The single-axis scenes above never combine view mode with a data extreme, so
column-width allocation under realistic pressure went untested. These cross the
two ([PRO-250](https://linear.app/protospy/issue/PRO-250), gap surfaced during
the [PRO-242](https://linear.app/protospy/issue/PRO-242) sweep). `backdrop()`
occupies ids 1..4; the stress row is id 5.

| Scene id                 | Cell                     | Notes                                                                          |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------------ |
| `table-dual-size`        | Table + dual size        | Table mode; Size column carries a `wire/decoded (gz)` label beside plain rows. |
| `table-long-uri`         | Table + long URI         | Table mode; Path column must truncate without pushing Time/Size/When off-edge. |
| `compact-table-long-uri` | Compact table + long URI | `table-long-uri` pressure at the tightest row height.                          |
| `compact-rows-dual-size` | Compact rows + dual size | Rows mode, compact density; compound size label in a tighter row.              |
| `mixed-table`            | Mixed realistic table    | Plain + dual-size + long-URI + ERR rows together; realistic column pressure.   |

### Trace axis (traceparent grouping)

Exchanges sharing a `traceparent` trace-id correlate into a distributed trace.
The list draws a coloured left trace bar + rail, the context bar gains a "next in
trace" jump, and the id surfaces in TimingView and (when filtered) the FilterBar
chip. No single-axis scene set a `traceId`, so none of this rendered in the
matrix ([PRO-250](https://linear.app/protospy/issue/PRO-250)). Both scenes inject
the same 7-exchange `tracedTraffic()` (trace A: ids 1/3/5, trace B: ids 4/6,
untraced: ids 2/7).

| Scene id         | Cell                | Notes                                                                                   |
| ---------------- | ------------------- | --------------------------------------------------------------------------------------- |
| `trace-group`    | Trace grouping      | Two distinct trace colours + untraced rows; id 5 selected for the "next in trace" jump. |
| `trace-filtered` | Trace filter active | Narrowed to trace A via an active trace filter; FilterBar chip + `N of M` count.        |

## List-pane width axis (interaction, not a scene)

The list-pane "narrow vs wide" axis is an **interaction**, not store state: the
pane width is the panel `defaultSize` at mount (`minSize` 200px), not a value the
store can push afterward. Drive it by dragging the resize separator. In tests,
use `dragListPaneTo(page, "min" | "wide")` from `browser/helpers/scenes.ts`;
interactively, drag the divider (double-click resets it to the mode default).
Combine with any scene to inspect that cell at the pane's minimum and wide
extents.

## Adding a cell

Add a `Scene` to `SCENES` in `src/test/scenes.ts` (reuse or extend builders in
`src/test/fixtures.ts` — don't duplicate fixtures in `browser/`). The
`fixture-matrix.spec.ts` breadth test and the `window.__test_scenes` harness
pick it up automatically. Update the tables above.
