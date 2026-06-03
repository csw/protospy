# Exploratory testing charters (protospy UI)

This document holds the **charter prompts** for agent-driven exploratory QA of
the protospy UI, plus the design decision behind how those charters are run. It
is the planning artifact for [PRO-289](https://linear.app/protospy/issue/PRO-289)
and the hand-off input for the execution ticket
[PRO-283](https://linear.app/protospy/issue/PRO-283).

Background and evidence for this approach live in the research report
`~/obsidian/protospy/UI/LLM-driven UI testing report.md`. The short version: an
LLM driving a real browser finds a _different_ class of issue than the unit /
component / browser suites or the static-fixture visual review — contextual,
in-the-moment "while actually using it, something is off" bugs. The dominant
failure mode is **false positives and token-burn**, and the proven mitigations
are tight charters, a step budget, screenshots only on findings, honesty rules,
and treating every finding as a lead requiring human confirmation. The charters
and the agent definition below are built around those mitigations.

---

## Decision: a bespoke `qa-explorer` agent, not the `ux-audit` skill

Scope item 4 of PRO-289 asks whether the installed jezweb `ux-audit` skill
(`dev-tools/skills/ux-audit/SKILL.md`) plus per-charter instructions is
sufficient, or whether protospy needs its own agent definition.

**Decision: write a bespoke `qa-explorer` agent definition
(`.claude/agents/qa-explorer.md`) and drive it with the charters below. Do not
use the `ux-audit` skill as-is.** Borrow `ux-audit`'s genuinely transferable
ideas — they are the parts the research independently validates — but do not
adopt its gate model or its viewport/coverage assumptions.

### Why the `ux-audit` skill does not fit as-is

The skill is excellent for its intended target (a multi-route, authenticated,
content/marketing-adjacent web app), but several of its load-bearing assumptions
are wrong for protospy:

- **Its hard gates contradict protospy policy.** `ux-audit` auto-fails on
  `console warnings > 0` (High) and on any `axe Critical/Serious` violation
  (Critical/High). protospy treats a11y as **advisory, not a gate** — axe runs
  non-blocking in `ui/browser/a11y.spec.ts`; only keyboard/focus quality is a
  real bar (`docs/frontend-dod.md`, `ui/CLAUDE.md`). Wiring a hard a11y gate into
  exploratory QA would directly contradict the project's stated quality model.
- **Its viewport matrix is wrong for protospy.** `ux-audit` pins 1440×900 and
  stress-tests 375 / 768 / 1024. protospy is **desktop-only (≥1280)**; below 1280
  is explicitly unsupported, and the "narrow" axis that matters is the _list
  pane_ (resizable `minSize`), not the window. Mobile-width findings would be
  pure noise.
- **It assumes a multi-route, authenticated SPA.** Sitemap crawl, RBAC/second-
  user scenarios, auth-expiry handling, the 11-scenario battery, the performance
  budget (LCP/CLS/INP on "the dashboard real users hit") — these presume routing,
  auth, and a content surface protospy doesn't have. protospy is a single-view
  traffic inspector with no auth and no router.
- **It doesn't know protospy's biggest advantage.** protospy can reach any UI
  state **deterministically** via `window.__test_scenes` / `window.__test_store`
  injection (the fixture matrix). The whole exploratory loop should lean on that;
  `ux-audit` has no concept of it.

### What we borrow from `ux-audit`

These elements are transferable and the research report calls each of them out as
important, so the `qa-explorer` agent adopts them (adapted to protospy):

- **Interaction-first discipline + an interaction manifest.** A verdict requires
  proof of real interaction (typed/clicked/observed with timestamps + selectors),
  not "it looked fine."
- **The audit-the-audit meta-check.** Reject rushed sessions (manifest entries
  clustered sub-0.5 s apart, screenshots far below the number of states visited).
- **A self-critique pass by a fresh sub-agent** that prunes generic/duplicate
  findings before the report is published.
- **Findings discipline:** every finding carries reproduction steps, evidence
  (screenshot path), a suspected `file:line` location, and a **confidence
  rating** — and a concrete, committable patch suggestion rather than "consider
  improving X."

This mirrors protospy's existing convention of small, purpose-built
`.claude/agents/*.md` definitions that drive `playwright-cli` and the fixture
matrix (see `visual-review.md`), rather than depending on a general-purpose
external skill whose gates we'd have to fight.

---

## How a charter is run

Each charter is one self-contained exploration. The `qa-explorer` agent
(`.claude/agents/qa-explorer.md`) is the executor; this document supplies the
mission, oracles, fixture states, and step budget for each.

- **Driving channel.** `playwright-cli` (see the `playwright-cli` skill) — the
  accessibility-tree snapshot is the primary, token-cheap navigation channel;
  screenshots are the secondary "does this look wrong" channel, taken on findings
  and key states only.
- **Reaching a state — injection first.** Most charters reach their starting
  state by injecting a fixture-matrix scene:
  `window.__test_scenes.apply('<scene-id>')` (full scene list and semantics in
  [`ui/docs/fixture-matrix.md`](../../ui/docs/fixture-matrix.md)). For states the
  matrix doesn't have a named cell for (e.g. a malformed JSON body), inject an
  ad-hoc exchange with `window.__test_store.applyEvent(...)` using the builders in
  `ui/src/test/fixtures.ts` (`makeGetRequest`, `makeResponse`, `makeCompleteExchange`,
  …). Both hooks exist only in dev / test-hook builds.
- **The one charter that can't use injection: live SSE timing.** Injection
  reproduces _content_ deterministically but not real streaming _timing_. Charter
  4's live-timing oracle requires real traffic from the demo stack — the protospy
  backend in front of the `flix/` demo app (or the example scripts in
  `scripts/examples/`), which drives genuine SSE over the wire. This is the
  charter that exposes stream-stabilization bugs static fixtures can't.
- **Widths.** Check at **1280 / 1440 / 1920** as relevant to the charter; default
  to 1440 unless the charter is layout-sensitive, in which case include 1280
  (minimum) and 1920 (wide). Below 1280 is out of scope.
- **Themes.** protospy is dark-first, so **light mode regresses unnoticed** —
  check both, and treat light mode as the higher-risk one.
- **Step budget.** Each charter names a budget of ~15–20 actions. When the budget
  is spent, the agent **stops and reports** — it does not random-walk. A
  "screenshot for evidence" is not an exploration step; a navigation/interaction
  is.

---

## The charters

Six charters, one per protospy surface. Each is independent and can be run
alone. Run them as separate short sessions (the research is explicit that long
sessions degrade into context-bloat hallucination) — not one long sweep.

Each charter is stated as: **Mission** (one sentence), **Fixture state(s)**,
**Oracles** (3–4 max — the things to watch; more than four turns exploration
into a checklist), **Step budget**, and **License** (a reminder of where the
agent may deviate).

---

### Charter 1 — Exchange list: density, view mode, filtering, selection

**Mission.** Use the exchange list the way someone triaging live traffic would —
switch view mode and density, filter, and select rows — and notice anything that
feels wrong about how the list reorganizes, truncates, or responds.

**Fixture state(s).**

- `selected` — populated rows-mode baseline.
- `table-mode`, `compact-rows`, `compact-table` — the view/density toggles.
- `many-rows` — 120 rows for virtualization, scroll, and the status-bar count.
- `mixed-table` — heterogeneous realistic traffic (plain + dual-size + long-URI +
  error rows) for column-allocation pressure.
- `long-uri` — a row whose path/query must truncate with a clipping affordance.
- `trace-group` / `trace-filtered` — coloured trace bars/rail and the active
  trace filter chip.
- For the **filter** oracle, type into the filter input over the `selected` or
  `mixed-table` backdrop and watch the `N of M` count update.

**Oracles.**

1. View-mode and density toggles re-layout cleanly — no row-height jitter,
   column reflow off-screen, or lost selection when toggling.
2. Long paths/queries truncate **with** a tooltip or expand affordance (silent
   cut-off is a defect, not just cosmetic), and the table Path column holds its
   width instead of pushing Time/Size/When off-edge.
3. Filtering narrows the list correctly, the `N of M` count is accurate, and
   selection/scroll behave sensibly as the visible set changes.
4. Trace grouping reads clearly: trace bars/rail are distinguishable, and the
   trace filter chip (dot + shortened id + clear) works.

**Step budget.** ~18 actions.

**License.** If a density or width combination looks off in a way the named
oracles don't cover (e.g. the status-bar count, a When-column relative-time
glitch), chase it and report it.

---

### Charter 2 — Inspector: Headers tab, request/response switching

**Mission.** Inspect a selected exchange's headers, switching between request and
response and across exchanges, and notice whether the side-by-side layout,
header formatting, and switching behaviour hold up.

**Fixture state(s).**

- `selected` — populated inspector with bodies/headers/timing.
- `error-row` — upstream failure; inspector shows the error in the context bar.
- `error-midstream` — response received then interrupted; context bar shows both
  status and error.
- `long-uri` — long path/query surfaced in the context bar and header values.
- `dual-size` — a response with header metadata worth reading alongside the body.

**Oracles.**

1. The headers layout (request vs response) is readable and aligned at all
   in-scope widths; long header values clip with an affordance, not silently.
2. Switching request↔response and switching the selected exchange updates the
   header pane correctly with no stale content from the previous selection.
3. The context bar communicates state honestly for error / mid-stream cases
   (status code and/or error message present and legible).
4. The pane respects its bounds — no wasted space at 1920, no cut-off at 1280 or
   when the list pane is dragged to its minimum.

**Step budget.** ~15 actions.

**License.** If switching tabs (Headers ↔ Body ↔ Timing) reveals a focus or
scroll-position bug, follow it even though it crosses into Charter 3's surface.

---

### Charter 3 — Inspector: Bodies (JSON tree, raw/hex, large + malformed)

**Mission.** Open response bodies and exercise the JSON tree collapse/expand and
the raw/hex view toggles against well-formed, large, compressed, and malformed
payloads — looking for rendering, truncation, and decode-feedback problems.

**Fixture state(s).**

- `selected` — a small well-formed JSON body (tree collapse/expand baseline).
- `dual-size` — a gzip-compressed JSON response; opening the body decodes and
  shows the `wire/decoded (gz)` size label.
- **Ad-hoc injections via `window.__test_store.applyEvent`** for cases the matrix
  has no named cell for:
  - a **large** JSON array/object (hundreds of nodes) to stress tree
    virtualization and collapse/expand at depth;
  - a **malformed** JSON body (truncated/invalid) to see how classification and
    the raw fallback behave;
  - a **binary** body to exercise the hex view.
    Build these with `makeResponse(id, status, bodyString)` /
    `makeGetRequest(id, path)` from `ui/src/test/fixtures.ts`.

**Oracles.**

1. The JSON tree expands/collapses correctly at depth without losing scroll
   position or rendering off-screen; large bodies stay responsive (virtualized).
2. The raw and hex toggles render their respective views correctly, and toggling
   between JSON / raw / hex preserves a sensible scroll/selection position.
3. Compressed bodies decode cleanly and the dual wire/decoded size label is
   accurate; malformed bodies degrade gracefully (clear raw fallback, no crash,
   no console error).
4. No clipping without an affordance, and no new console errors during decode or
   toggling.

**Step budget.** ~20 actions (the widest charter — more states to reach).

**License.** Malformed and binary payloads are where surprises hide; if a
specific pathological body produces an odd state, capture it and report it with a
repro even if it falls outside the three oracles. **Note for PRO-283:** if these
ad-hoc bodies prove valuable, graduate them into named scenes in
`ui/src/test/scenes.ts` so
future runs (and the browser suite) cover them deterministically.

---

### Charter 4 — SSE streaming: live updates, completion, error/disconnect

**Mission.** Watch SSE streams render — both injected deterministic states and
**real live traffic from the demo stack** — and judge whether live updates,
completion, and error/disconnect states read correctly and stabilize cleanly.

**Fixture state(s).**

- `stream-live` — generic SSE still receiving events; green pulsing "live"
  indicator; a BodyData event adds a third event.
- `stream-complete` — generic SSE, `atEnd: true`; gray "complete" indicator.
- `stream-error` — generic SSE interrupted by a Response error; red
  "disconnected" indicator + `StreamErrorBanner`.
- `stream-anthropic` / `stream-anthropic-error` — Anthropic-protocol stream
  (`ChatStreamView` transcript/events toggle), complete and error variants.
- **Live demo-stack traffic (required for the timing oracle).** Run the protospy
  backend in front of the `flix/` demo app (or use `scripts/examples/*`) so the
  UI receives genuine streaming SSE over the wire. This is the only way to
  exercise real stabilization timing; injection can't reproduce it.

**Oracles.**

1. Live updates append in order and the live/complete/disconnected indicators
   match the actual stream state; the event list and transcript toggle stay
   consistent.
2. Under **real** streaming, the view **stabilizes** — no flicker, no half-
   rendered events, no layout shift after the stream settles. (Wait for the
   stream to settle before judging; re-observe before reporting a visual anomaly
   — transient mid-render artifacts are the top false-positive source here.)
3. Error/disconnect states surface the error message clearly via the
   `StreamErrorBanner` without dropping already-received events.
4. Scroll-follow behaves: it follows the tail while live, and a user scroll-up
   pauses follow without snapping back unexpectedly.

**Step budget.** ~20 actions.

**License.** This surface is simultaneously the **highest-value and highest-
false-positive** target (timing artifacts). Lean on re-observation and confidence
ratings; a low-confidence streaming finding is a signal to re-run, not to ship.
**Note:** reconnection is _not_ reachable by injection and is not covered by the
browser suite — if you want to exercise it, it requires driving the real
`EventSource` against a flapping backend, which is out of scope for a charter run
and should be flagged rather than faked.

---

### Charter 5 — Keyboard navigation and focus

**Mission.** Operate the app keyboard-only — Tab through controls, select
exchanges with arrow keys, switch inspector tabs — and judge whether tab order,
focus visibility, and keyboard operability hold up. This is protospy's one
**non-advisory** a11y bar.

**Fixture state(s).**

- `many-rows` — a long list for arrow-key row navigation and scroll-into-view.
- `selected` — populated inspector for tab-switching and focus movement between
  list and inspector.
- `table-mode` — keyboard behaviour in the columnar layout.
- `trace-group` — the trace pill is an interactive control; verify it's keyboard-
  operable (this was the subject of PRO-259).
- `stream-complete` — inspector tab switching with a stream view present.

**Oracles.**

1. Tab order is logical and complete — every interactive control (filter input,
   view/density toggles, rows, inspector tabs, trace pill, command palette
   trigger) is reachable, and focus never gets trapped.
2. Focus rings are **visible** on every focusable element in both themes (focus
   visibility is a real bar, not advisory).
3. Arrow-key selection moves the selected row predictably and scrolls it into
   view; Enter/Escape/tab-switch keys do what a keyboard user expects.
4. Opening and dismissing the command palette (and any overlay) returns focus
   sensibly to where it was.

**Step budget.** ~18 actions.

**License.** If a focus-management bug appears during an interaction another
charter owns (e.g. focus lost after a body decode), report it here — keyboard
operability is the throughline.

---

### Charter 6 — Theme and preference persistence

**Mission.** Switch theme (light / dark / system) mid-session and verify the
switch is clean and that theme and other UI preferences **persist across a page
refresh**.

**Fixture state(s).**

- `selected` and `many-rows` — populated, content-rich states so a theme switch
  exercises many tokens at once (rows, badges, context bar, body pane).
- Any scene works; the point is the **mid-session toggle** and the **refresh**,
  not the data.
- Run the browser session with `playwright-cli open --persistent` so
  `localStorage` (`protospy-ui-prefs`) survives the refresh and the persistence
  oracle is actually testable.

**Oracles.**

1. Toggling light ↔ dark ↔ system re-themes the **whole** UI immediately — no
   element keeps a stale colour, no flash, no unreadable contrast in either
   resolved theme (watch light mode especially).
2. The `system` preference tracks the OS scheme and resolves to a concrete
   theme; switching the simulated OS scheme updates the resolved theme.
3. After setting a non-default theme (and any other persisted pref — density,
   list mode, list width) and **refreshing**, the preference is restored from
   `protospy-ui-prefs` with no flash of the wrong theme on load (the pre-React
   bootstrap in `index.html` should prevent FOUC).
4. No new console errors during theme switching or on the post-refresh load.

**Step budget.** ~15 actions.

**License.** Contrast problems that only appear in one theme on one surface are
exactly the class of bug this charter exists to catch — if you spot one outside
the listed states, capture it (both themes, same state) and report it.

---

## Charter → fixture-state map

| Charter            | Primary scenes                                                                                                                     | Ad-hoc / live                                 | Widths             | Notes                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------ | -------------------------------------------------- |
| 1 — Exchange list  | `selected`, `table-mode`, `compact-rows`, `compact-table`, `many-rows`, `mixed-table`, `long-uri`, `trace-group`, `trace-filtered` | filter input typing                           | 1280/1440/1920     | Layout-sensitive → all 3 widths                    |
| 2 — Headers        | `selected`, `error-row`, `error-midstream`, `long-uri`, `dual-size`                                                                | —                                             | 1280/1440          | Pane bounds at min + 1280                          |
| 3 — Bodies         | `selected`, `dual-size`                                                                                                            | large / malformed / binary via `__test_store` | 1440               | Graduate ad-hoc bodies → scenes (PRO-283)          |
| 4 — SSE streaming  | `stream-live`, `stream-complete`, `stream-error`, `stream-anthropic`, `stream-anthropic-error`                                     | **live demo-stack traffic (required)**        | 1440               | Reconnection not injectable / not in browser suite |
| 5 — Keyboard/focus | `many-rows`, `selected`, `table-mode`, `trace-group`, `stream-complete`                                                            | —                                             | 1440               | Non-advisory a11y bar                              |
| 6 — Theme/prefs    | `selected`, `many-rows` (any)                                                                                                      | refresh w/ `--persistent`                     | 1440 (both themes) | `protospy-ui-prefs` persistence                    |

## Known gaps and follow-ups for PRO-283

- **Body-state coverage.** The fixture matrix has no named cell for malformed
  JSON, a very large JSON body, or a binary/hex body. Charter 3 injects these
  ad-hoc; if they earn their keep, add scenes to `ui/src/test/scenes.ts` so
  they're covered deterministically by both the browser suite and future runs.
- **SSE reconnection.** Not reachable by store injection and not covered by the
  `ui/browser/` suite (it stubs `/service/.../events` and never drives the real
  `EventSource`). Exercising it needs a flapping real backend — flag, don't fake.
- **Graduating findings into the suite.** Per the research report: if a charter
  consistently finds the same issue, convert it into a deterministic Playwright
  assertion in `ui/browser/` rather than re-discovering it every run.
  </content>
  </invoke>
