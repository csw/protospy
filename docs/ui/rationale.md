# protospy UI — Design Rationale & Principles

Companion to `design-system.md`. That doc says *what*; this one says *why*, for
human contributors deciding whether a rule still applies to a new situation.

## Guiding principle: content over chrome

protospy is not a network-timeline tool. The job is **reading request/response
content together** — a query next to its results. Every decision favors content
density, legibility, and fast navigation between related exchanges over
dashboard-style chrome. When a tradeoff appears, the side that shows more content
more legibly wins.

## Why shadcn semantic tokens (and the `accent` trap)

shadcn components are authored against a fixed vocabulary of ~12 color roles
(`background`, `foreground`, `card`, `primary`, `secondary`, `muted`, `accent`,
`destructive`, `border`, `input`, `ring`, …). If we adopt those names and assign
them our Modern palette, **every stock component is themed for free** — no
per-component overrides, no drift. So the token layer is: shadcn slots first,
protospy domain namespaces (`method-*`, `status` kinds, `json-*`, `trace-*`) layered
on top for the things shadcn has no concept of.

The one counterintuitive part: **`--accent` is a surface, not the brand color.** In
shadcn, `accent` is the muted fill behind a hovered menu item or selected row;
`primary` is the saturated brand/action color. Our Modern "accent blue" is therefore
`--primary`, and our selection tint is `--accent`. Conflating them makes menus and
comboboxes glow. This is the single most common way to get the theme wrong.

Domain colors stay as their own namespaces (rather than, say, reusing `chart-*`)
because they carry semantics a reader decodes instantly: a method's tint, a status
class, a JSON token type. `--trace-1..7` is the exception that *is* chart-like — an
arbitrary categorical palette assigned by hashing the trace id, so the same trace is
always the same color within a session.

## Why the hybrid density model

Three plausible approaches; each pure form has a flaw:

- **Pure Tailwind variants** (`compact:` on every element): the size numbers scatter
  across dozens of components and it's easy to forget one, yielding half-compact rows.
- **Pure React context** (read density, branch in JS): pushes layout into JS that CSS
  should own, and re-renders the tree on toggle.
- **Pure token swap** (`data-density` overrides the size tokens): elegant and the
  least error-prone, but CSS can't hand the **virtualizer** a numeric row height.

So we use the token swap as the engine, wrap it in a `DensityProvider` for an
idiomatic context/toggle API, keep the `compact:` variant available for the rare
non-size delta, and expose `useDensity().rowPx` for the one consumer that needs a
number. You get the convenient surface of context+variants with the robustness of a
single token swap underneath.

## Why react-table for the table view

The two list views trade off: **rows** mode is the richer trace-rail presentation and
is the **default** (PRO-402); the dense **table** is the alternate. A six-column table
wants column sizing, sorting, and visibility — exactly what **`@tanstack/react-table`**
owns, *headlessly*.
It renders nothing itself, so our custom row markup and tokens are untouched; it just
supplies column/sort/size state. It shares an author and mental model with
**`@tanstack/react-virtual`**, so virtualized + sortable + resizable compose without
friction. Hand-rolling this later would re-invent a well-trodden wheel.

## Why the trace rail takes offsets, not the DOM

The rail draws one bar per multi-member trace, lane-packed so overlapping traces
don't collide. With virtualization, a trace's first or last member may be unmounted,
so the rail can't measure DOM. Instead it takes the **full ordered trace-id list**
(cheap — bounded by the filtered set) and `rowTop(i)`/`rowBottom(i)` accessors from
the virtualizer. Lane packing is a pure function (`packLanes`) over indices, so it's
testable and independent of rendering. Single-member traces never take a lane — the
row's left border already marks them; a lane would waste horizontal space.

## Why these content invariants are non-negotiable

- **Never truncate fixed metadata.** A timestamp ellipsized to `14:32:0…` is useless
  for log correlation — the whole point of the tool. Bounded fields size the column
  to the value; only genuinely unbounded values (paths, bodies) truncate, and then
  behind an expand affordance.
- **Network error ≠ HTTP error.** "Couldn't reach upstream" and "upstream returned
  500" are different failures a developer must distinguish at a glance, so they get
  visually distinct treatments (we own the look; app code owns the exact words).
- **Lifecycle-aware bodies.** Data arrives incrementally over SSE: request start,
  body chunks, response start, response chunks. A flat "pending" hides where in that
  lifecycle an exchange is. Distinct *awaiting-response* vs *awaiting-body* states (on
  both sides) make the live state legible.

## Why "Exchange" in code but "Request" in the UI

The precise internal entity is an exchange (a request *and* its response). But users
think and speak in "requests." Keeping component/type names on `Exchange` while the
surface noun is "Request" matches the live app and keeps the two vocabularies from
bleeding into each other — rename the label without touching the model, and vice
versa.

## Custom vs. stock: where the line sits

Stock shadcn handles everything with a conventional analog: buttons, inputs, tabs,
menus, toggles, the palette, the resizable split, toasts. Custom is reserved for the
content-centric core where no off-the-shelf component encodes protospy's semantics:
the exchange list/table, the trace rail, the JSON/JSONL viewer, the msearch paired
view, and the SSE stream view — plus the small domain atoms (method badge, status,
trace tag) that those compose from. The atoms still build on tokens + `cva` + `cn`,
so they read as part of the same system.

## Open items — recommendations (deferred, not decided)

These are post-MVP; the component choices above are arranged so they slot in without
rework.

- **Stream parser registry:** ship Anthropic + OpenAI transcript parsers, fall back to
  the events log for unknown shapes (`transcript == null` ⇒ events-only). Keep the
  registry a config point.
- **Group-by-trace ordering:** emitting groups at their first member's position is
  fine for MVP; a "most-recently-active floats up" mode is the likely follow-up.
- **Filter grammar:** start with substring; later add `method:`, `status:5xx`,
  `trace:`, `path:` with substring fallback. `cmdk` can power both filter and palette.
- **Trace root info / Jaeger:** define the per-service config + async-load placeholder
  now (the trace tag already reserves the `↗` slot); render real root info in v2.1.
- **Trace headers:** allow a configurable header allowlist (W3C `traceparent`, B3,
  custom) at the data layer.
- **Service selection:** single-select for now; multi-select complicates trace
  coloring and is not an MVP need.
