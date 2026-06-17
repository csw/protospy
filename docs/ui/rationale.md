# protospy UI — Design Rationale & Principles

Companion to `design-system.md`. That doc says _what_; this one says _why_, for
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
class, a JSON token type. `--trace-1..7` is the exception that _is_ chart-like — an
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
owns, _headlessly_.
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
  lifecycle an exchange is. Distinct _awaiting-response_ vs _awaiting-body_ states (on
  both sides) make the live state legible.

## Why "Exchange" in code but "Request" in the UI

The precise internal entity is an exchange (a request _and_ its response). But users
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

## Why a documented convention, not a lint rule, for modifier-scoping (PRO-339)

tailwind-merge only de-duplicates classes within the same variant scope, so an
unprefixed override silently loses to a variant-prefixed base class (`cn("md:text-sm",
"text-xs")` keeps both; `md:` wins at desktop), and a low-specificity class loses to a
higher-specificity arbitrary variant (`p-0` vs `has-[>svg]:px-1.5`). We evaluated
catching this at author time with ESLint and **chose a documented convention plus a
convention-review guardrail over a lint rule.**

No off-the-shelf rule detects it. Every conflict rule in the ecosystem
(`eslint-plugin-tailwindcss`'s `no-contradicting-classname`,
`eslint-plugin-better-tailwindcss`, `oxlint-tailwindcss`) flags only _same-property,
same-variant_ duplication — and treats unprefixed-vs-prefixed (`p-1 lg:p-4`) as
_correct by design_, which is exactly our footgun. `eslint-plugin-tailwindcss` also has
no Tailwind v4 support outside a partial alpha and expects a JS config we don't have
(CSS-first v4). A correct custom rule would need a real CSS model — breakpoint-overlap
reasoning for the variant case and selector-specificity computation (including `:has()`
under v4 cascade layers) for the specificity case — not a string heuristic; the mature
plugin's open specificity bug (#164) shows even that is unsolved upstream. A narrow
hardcoded smell-detector for one known pair is writable but wouldn't generalize.

The footgun has bitten twice and both times during _review_ (a class wrongly called
redundant), not authoring, so the guardrail belongs where review happens: the
modifier-scoping rule in design-system.md §4 (rule 16) and the convention-review agent.
Revisit a lint rule if `eslint-plugin-better-tailwindcss` or oxlint ships
specificity-aware cross-variant detection.

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
