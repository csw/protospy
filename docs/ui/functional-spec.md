# protospy UI Functional Spec (`docs/ui/functional-spec.md`)

**Status:** a draft inventory of the UI's deliberate **presentational and behavioral
decisions** — *what the UI does and why* — pending ratification by Clayton. It is the
behavior sibling of `docs/ui/design-system.md` (which governs *appearance*) and the
architecture-invariants spec (PRO-334, *structure*). Where the design system says "this
control is backed by `ToggleGroup` and draws on `bg-sub`," this document says "table view
is the default, and here's why."

This doc is **designed to accrete**. v1 captures a bounded seed set plus clearly
same-class decisions the harvest surfaced; larger or less-certain areas are parked under
[Candidates for later accretion](#candidates-for-later-accretion) rather than forced in.

### How to read an entry

Each decision gives:

1. **The decision** — what the UI actually does (verified by driving the running app, not
   inferred from code).
2. **Rationale** — the *why*. Taken from a PR / ticket / handoff note where recorded. Where
   the why is **not** recorded anywhere, it is written as a best inference and tagged
   **_(inferred — confirm with Clayton)_**. Do not treat an inferred rationale as settled.
3. **Where it's implemented** — the file(s) a reviewer would touch.

> **Discrepancy flags.** Where the running app disagrees with a note, ticket, or the seed
> brief, the entry says so explicitly rather than silently picking a side. These are called
> out again in the ratification summary.

All behavior below was observed in the running app on branch `pro-332-functional-spec`
(2026-06-05) via the `window.__test_scenes` fixture matrix.

---

## 1. List / table view

### 1.1 Table view is the default list mode

**Decision.** The exchange list opens in **table mode** (dense columnar rows:
`METHOD · STATUS · PATH · ELAPSED · SIZE · TIME`), not the taller multi-line "rows" mode.
A segmented `rows / table` control in the list toolbar switches between them, and the choice
persists across refresh. Verified: a fresh store reports `listMode: "table"`.

**Rationale.** Table mode is the scanning / log-correlation view — one exchange per compact
line, columns aligned for vertical comparison — and was deliberately promoted to the primary
view in **PRO-222** ("improve exchange list table mode as primary view"). Rows mode remains
for users who want the richer per-item layout. _(The store default being `table` is
observed; the framing of "table = primary scanning view" is from PRO-222. The judgment that
table should be the **default on first load** rather than rows is **inferred — confirm with
Clayton**.)_

**Where.** `state/store.ts` (`listMode: "table"` default; `partialize` persists it);
`components/ExchangeList.tsx` (`TABLE_COLUMNS`, mode toggle).

### 1.2 Rows mode and table mode present the same fields differently

**Decision.** The two modes are not just denser/looser versions of one layout — they make
different presentational choices for the same data:

| Field      | Rows mode                                   | Table mode                                       |
| ---------- | ------------------------------------------- | ------------------------------------------------ |
| Method     | `MethodBadge` (colored pill)                | colored mono text                                |
| Status     | **full** status string (`200 OK`) inline    | status **code** only (`200`); full text in tooltip |
| Time       | **relative** (`now`, `3s`, `21m`, `4h`)     | **absolute** `HH:MM:SS.mmm` (local/UTC toggle)   |
| Size       | `req X · res Y` with encoding tag           | single response wire size + compression marker   |

**Rationale.** Rows mode optimizes for reading one exchange at a time (badge, spelled-out
status, human-relative "how long ago"); table mode optimizes for scanning and cross-log
correlation (fixed columns, exact millisecond wall-clock, bounded single-value cells).
_(The split is clearly deliberate in the code, but the explicit "why each mode chose its
representation" is **inferred — confirm with Clayton**.)_

**Where.** `components/ExchangeListItem.tsx` (rows: `MethodBadge`, full status,
`useRelativeTime`); `components/ExchangeList.tsx` `TableRow` (table: code + `title`,
`formatAbsoluteTime`).

### 1.3 Newest-first is the default order

**Decision.** The list shows the **newest exchange first** by default; an order toggle in the
toolbar flips to oldest-first, and the choice persists. Verified: fresh store reports
`order: "newest"`.

**Rationale.** Live traffic monitoring — the most recent request is the one the user is
usually waiting on, so it belongs at the top where it is visible without scrolling.
_(Default observed; rationale **inferred — confirm with Clayton**.)_

**Where.** `state/store.ts` (`order: "newest"`); `components/ExchangeList.tsx`
(`ordered = order === "newest" ? [...filtered].reverse() : filtered`).

---

## 2. Timestamps & no-truncation

### 2.1 Local / UTC time-zone toggle (table mode)

**Decision.** In **table mode**, a `Local / UTC` toggle in the list toolbar switches the TIME
column between local and UTC, rendered as `HH:MM:SS.mmm`. The active zone is labeled on the
control (`Local` / `UTC`, the latter in accent color), and the choice persists across refresh
(`timeZone`, default `local`). The toggle is **only shown in table mode** — rows mode shows
relative time, which has no zone. Verified: toggling flips the label and the rendered TIME
values; the cell `title` appends ` UTC` when in UTC.

**Rationale.** Recorded in `lib/utils.ts`: absolute time with millisecond resolution is
"suitable for log correlation — milliseconds help match events across different log sources."
UTC specifically lets a user line protospy's timestamps up against server-side logs that are
almost always emitted in UTC.

**Where.** `lib/utils.ts` (`formatAbsoluteTime`, `TimeZone`); `components/ExchangeList.tsx`
(toggle, gated on `listMode === "table"`); `state/store.ts` (`timeZone`, persisted).

### 2.2 Fixed table columns never truncate; only PATH clips

**Decision.** In table mode, the fixed columns — METHOD, STATUS, ELAPSED, SIZE, TIME — are
sized to fit their worst-case content and **never truncate**. PATH is the only flexible
column; it absorbs slack and truncates with an ellipsis, with the full URI available in a
tooltip. Verified: across the `mixed-table` fixture, no METHOD/STATUS/ELAPSED/TIME cell
reported overflow (`scrollWidth ≤ clientWidth`).

**Rationale.** These are scannable identity and correlation fields — an HTTP method, a status
code, an exact latency, an exact timestamp — and a clipped one is worse than useless: it
reads as a *different* value. The column widths were explicitly computed against the rendered
fonts to guarantee no clipping (**PRO-222**, **PRO-286**: the original under-sized tracks
collided header labels into "METHODSTATUSPATH" and tipped the timestamp into clipping). The
broader rule — "no clipping without an expand affordance or tooltip" — is enshrined in the
frontend Definition of Done (`docs/frontend-dod.md` §2.3).

**Where.** `components/ExchangeList.tsx` (`TABLE_COLUMNS` constant and its sizing comment).

### 2.3 Status: code in the table, full message in a tooltip

**Decision.** The table STATUS cell shows the numeric **code** (`200`, `500`, `201`), colored
by class, with the **full status line** (`200 OK`, `500 Internal Server Error`) in the cell's
`title` tooltip. A network/proxy error renders as `ERR` (or `<code> ✕` when a code is known),
with the **error message** in the tooltip (e.g. `connection refused (os error 111)`). Verified
across `mixed-table`. _(Note: rows mode shows the **full** status line inline instead — see
1.2.)_

**Rationale.** The code is the scannable signal that fits a fixed-width column; the human
phrase ("Internal Server Error") is reference detail that would blow the column budget, so it
moves to hover. Same move as SIZE, whose wire/decoded/encoding breakdown went to a tooltip in
**PRO-286**. _(The code-vs-message split is observed and consistent with PRO-286's
tooltip-for-detail pattern; the explicit rationale is **inferred — confirm with Clayton**.)_

**Where.** `components/ExchangeList.tsx` (`statusCode()`, the STATUS `<span>` `title`).

---

## 3. Stream (SSE) view

### 3.1 Four-state live indicator (live / paused / complete / disconnected)

**Decision.** SSE stream views show a status badge with **four** states, derived from the
stream's `atEnd` flag, the scroll-follow state, and any response-direction error:

| State          | When                                              | Rendering        |
| -------------- | ------------------------------------------------- | ---------------- |
| `live`         | streaming, user following the tail                | green dot, pulse |
| `paused`       | streaming, user scrolled away from the tail       | amber dot        |
| `complete`     | stream closed cleanly (`atEnd`)                   | grey dot         |
| `disconnected` | response-direction error before a clean close     | red dot          |

Priority is `atEnd` (complete) > error (disconnected) > scroll position (live/paused).
Verified live: `live`, `complete`, and `disconnected` observed directly via the
`stream-live` / `stream-complete` / `stream-error` fixtures; `paused` is the scroll-away
derivation (see 3.2).

**Rationale.** The v2 design spec called for three indicator states (live / paused /
complete); the implementation originally shipped only two, which the **PRO-131** design audit
caught and filed as **PRO-150** (add the `paused` state). The implementation went one further
and added `disconnected` to distinguish a mid-stream upstream drop from a clean close — the
`atEnd`-first priority is documented in `LiveIndicator.tsx` because the Rust proxy only sets
`atEnd` on a clean transport close.

**Where.** `components/LiveIndicator.tsx` (`deriveStreamState`, `INDICATOR_CONFIG`);
`components/StreamView.tsx`, `components/anthropic/ChatStreamView.tsx` (callers).

### 3.2 Implicit live-follow with a "jump to latest" pill

**Decision.** Stream views **auto-scroll to the tail** while new events arrive. If the user
scrolls up (more than a 40px threshold from the bottom), follow **pauses** (indicator →
`paused`) and a **"Jump to latest"** pill appears; clicking it scrolls to the bottom and
re-enables follow. There is no explicit play/pause control — following is implicit in scroll
position.

**Rationale.** Recorded in the v2 handoff direction: "Stream view: implicit live-follow with
'jump to latest' pill." It mirrors the terminal/log-tail convention — scroll up to inspect
without losing your place, one click to resume tailing.

**Where.** `hooks/useStreamFollow.ts` (40px threshold, `isFollowing`, `jumpToLatest`);
`components/StreamView.tsx` (pill shown when `state === "paused"`).

---

## 4. Body rendering

### 4.1 Bodies are auto-classified; there is no parsed / raw / hex mode toggle

**Decision.** A body pane decodes the body and renders it according to an **automatic
classification** — `json` / `jsonl` (pretty-printed via `JsonViewer` with collapsible tree
nodes), `text` (monospace `<pre>`), or `binary` (a `Binary data · <size>` placeholder). There
is **no user-facing toggle** to switch a body between parsed, raw, and hex representations.
The pane head shows the media type, the wire/decoded size, and a copy button — nothing more.
Verified: no `raw` / `hex` / `parsed` control exists anywhere in the inspector.

> **⚠ Discrepancy with the seed brief.** The PRO-332 brief listed "body view modes (parsed /
> raw / hex)" as a likely same-class decision to capture. The running app has **no such
> modes** — classification is automatic and the rendering is fixed per kind. This entry
> records the *actual* behavior (auto-classify, no toggle). Whether parsed/raw/hex modes are
> a desired-but-unbuilt feature, or an intentionally-rejected one, is **a question for
> Clayton** — see the ratification summary.

**Rationale.** _(inferred — confirm with Clayton)_ The decode pipeline already knows the
content type and can pick the most useful representation, so the common case needs no manual
mode-switching. A raw/hex escape hatch for the cases auto-detection gets wrong does not yet
exist.

**Where.** `components/BodyPane.tsx` (kind-switched rendering); `body/decode.ts` (the
classify step); `components/JsonViewer.tsx` (JSON/JSONL rendering).

### 4.2 Streaming bodies render only once complete

**Decision.** A non-SSE body pane shows nothing decoded until the body is fully received
(`atEnd`); while streaming it shows `Streaming… (<N> received)`. (SSE bodies are the
exception — they parse incrementally and render events as they arrive; see §3.) An
interrupted body shows a centered "Response interrupted" error with the bytes-received count.

**Rationale.** _(inferred — confirm with Clayton)_ Decoding (decompress → decode → classify →
pretty-print) is a whole-body operation; running it on each partial chunk would be wasteful
and could mis-classify a truncated prefix. SSE is handled separately precisely because it
*is* meaningful incrementally.

**Where.** `hooks/useDecodeBody.ts` (decodes only when `atEnd`); `components/BodyPane.tsx`
(streaming / interrupted states).

---

## 5. Inspector chrome

### 5.1 A single tab strip spanning both panes

**Decision.** The inspector has one tab strip — **Bodies** (relabeled **Stream** for
`text/event-stream` responses), **Headers** (request + response side-by-side), **Timing** —
plus a conditional **Pairs** tab shown only for Elasticsearch/OpenSearch msearch/mget
exchanges. Verified: a plain exchange shows `Bodies · Headers · Timing`.

**Rationale.** Recorded in the v2 handoff: "Inspector chrome: single tab strip across both
panes." Headers were unified into one side-by-side tab rather than separate Req/Res tabs.
The Pairs tab is protocol-gated so it never appears for traffic where it is meaningless.

**Where.** `components/Inspector.tsx` (tab list, `isStream` relabel, `isMsearch` gate);
`protocol/index.ts` (`showPairsTab`).

---

## 6. State that persists across refresh

**Decision.** UI **preferences** persist to `localStorage` (key `protospy-ui-prefs`); session
and traffic state do **not**. Verified against the persisted payload:

| Persists (preferences)                                              | Does **not** persist (session / transient)                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| list pane width (per mode), density, order, list mode, trace-group toggle, **theme**, **time zone** | selected exchange, filter text, trace filter, hover trace, ⌘K open, and all traffic (exchanges) |

**Rationale.** This is the conventional Zustand `persist` + `partialize` split: durable
"how I like the UI" choices survive a reload, while "what I'm currently looking at" and the
live traffic stream are session-scoped and rebuild on reconnect. _(The split is observed and
matches the standard pattern; PRO-119 introduced the persist middleware. The exact membership
of each column — e.g. that **filter** deliberately does *not* persist — is **inferred —
confirm with Clayton**.)_

**Where.** `state/store.ts` (`partialize`, persist `name: "protospy-ui-prefs"`, `version: 1`;
v0→v1 migrates the old `darkMode: boolean` to the three-state `theme` enum).

---

## 7. Global chrome decisions

### 7.1 Connection status dot (three states)

**Decision.** The service picker in the top bar carries a connection dot: **green** (open),
**amber + pulse** (connecting), **red + pulse** (reconnecting/down). This is distinct from the
stream live-indicator (§3.1) — it reflects the SSE *transport* to the backend, not an
individual stream.

**Rationale.** _(inferred — confirm with Clayton)_ A persistent, always-visible signal of
whether the UI is actually receiving traffic, separate from any one exchange's state.

**Where.** `components/TopBar.tsx` (`connectionDotClass`); also surfaced in
`components/StatusBar.tsx`.

### 7.2 Theme is a three-state cycle (dark / light / system)

**Decision.** The theme control cycles **dark → light → system** (not a binary dark/light
toggle); `system` follows the OS via `matchMedia`. Default is `system`. The preference
persists, and first paint is themed before React loads (a bootstrap IIFE in `index.html`).

**Rationale.** Recorded in **PRO-256** ("add three-state theme preference and single-source
DOM writes"): a `system` option that tracks the OS is the modern convention, and a single
runtime DOM writer avoids flash-of-wrong-theme. protospy is dark-first.

**Where.** `state/store.ts` (`theme`, persisted; the `subscribeWithSelector` DOM writer);
`theme/applyTheme.ts`; `components/TopBar.tsx` (`THEME_CYCLE`).

### 7.3 Density toggle (regular default, compact option)

**Decision.** A density toggle switches list/table rows between **regular** (default) and
**compact** (shorter rows, tighter padding). Persists.

**Rationale.** Recorded in the v2 handoff: "Density: regular by default, with a compact
toggle. Both fully specified." Compact trades breathing room for more rows on screen.

**Where.** `state/store.ts` (`density`); `components/TopBar.tsx` (toggle);
`components/ExchangeListItem.tsx`, `components/ExchangeList.tsx` (height/padding).

### 7.4 Double-click the list/inspector divider resets the list width

**Decision.** Double-clicking the resizable divider between the list and inspector resets the
list pane to its default width **for the current mode** (rows vs table have separate
defaults).

**Rationale.** Recorded as **PRO-153** (a PRO-131 audit finding, since implemented): a
standard "reset to default" affordance for a draggable splitter.

**Where.** `components/AppShell.tsx` (`handleSeparatorDoubleClick`, `DEFAULT_LIST_WIDTH`).

---

## Candidates for later accretion

Surfaced during the harvest but **deliberately deferred** out of v1 — either larger than the
seed scope, not yet built, or still an open design question. Listed so the next accretion pass
has a worklist; **not** specified here.

- **Trace rail & trace grouping.** The trace rail is currently a placeholder strip (no
  lane-packed bars); trace grouping (`traceGroupOn`) collapses multi-member traces into group
  cards. Substantial behavior (lane packing, group ordering, hover-dim interactions) is
  partially built or open (PRO-18, PRO-125, PRO-15). Worth its own spec section once settled.
- **Filtering behavior.** Today the filter is a plain substring match over method/URI/status,
  and it does **not** persist across refresh. A structured filter grammar (`method:`,
  `status:5xx`, `path:`, AND-ing) is specced but unbuilt (PRO-127). Capture once the grammar
  lands.
- **msearch / paired view.** The Pairs tab exists but renders "not yet available"; numbered
  sub-cards, focus mode, linked scroll, raw-NDJSON toggle are all unbuilt (PRO-56).
- **Stream event rows: per-event detail.** Event rows show a sequence index, not the
  `+Nms`-relative timestamps the spec calls for (PRO-152, blocked on backend timing data,
  PRO-62). Generic (non-Anthropic) streams gained event-type color-coding (PRO-151); transcript
  mode is Anthropic-only.
- **Stream replay / play-pause controls.** The v2 spec defines Replay and Play/Pause buttons;
  neither is implemented (PRO-154). The only stream interaction today is implicit follow +
  jump-to-latest (§3.2).
- **Service picker — single vs multi-select.** Currently single-service. Multi-select / "all
  services" is an open design question (handoff open item #8).
- **Body parsed / raw / hex modes.** See §4.1 — whether these should exist at all is an open
  question for Clayton, not a deferred-but-decided item.
- **Command palette scope.** ⌘K currently offers commands only (theme, density, list mode,
  order, time zone) and no longer lists individual exchanges. Worth recording deliberately
  once confirmed intentional.

---

## Reconciliation with prior sources

### `ui-v2-design-tracker.md` (Obsidian, last updated 2026-05-23)

| Tracker item                                  | Status in this spec                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| Table mode / rows mode / segmented control    | **Captured** — §1.1, §1.2                                                   |
| Order toggle                                  | **Captured** — §1.3                                                         |
| Live indicator "paused" state (was Discrepancy) | **Captured & resolved** — §3.1 now ships 4 states (PRO-150 done)         |
| Live-follow with "jump to latest"             | **Captured** — §3.2                                                         |
| Double-click divider reset (was Not started)  | **Captured & resolved** — §7.4 now implemented (PRO-153 done)              |
| Density toggle (regular/compact)              | **Captured** — §7.3                                                         |
| Single tab strip / unified Headers            | **Captured** — §5.1                                                         |
| Trace rail / trace grouping                   | **Deferred** — Candidates list (still partial/open)                        |
| Event timestamps `+Nms`                       | **Deferred** — Candidates list (PRO-152, blocked)                          |
| Generic StreamView color-coding (was Partial) | **Deferred** — Candidates list (PRO-151 since done; presentational, not behavioral) |
| Replay + play/pause                           | **Deferred** — Candidates list (PRO-154, unbuilt)                          |
| msearch / paired view                         | **Deferred** — Candidates list (PRO-56, unbuilt)                           |
| Filter syntax extensions                      | **Deferred** — Candidates list (PRO-127)                                   |
| Command palette exchange search               | **Deferred** — Candidates list (note: app now shows commands-only)         |

### PRO-131 design-audit findings

The PRO-131 audit (read-only, against the v2 handoff spec) spawned PRO-150–PRO-154:

| Finding (ticket)                          | Status in this spec                                          |
| ----------------------------------------- | ----------------------------------------------------------- |
| PRO-150 — `paused` indicator state        | **Captured** — §3.1 (implemented; now 4-state)              |
| PRO-153 — double-click divider reset      | **Captured** — §7.4 (implemented)                            |
| PRO-151 — generic StreamView color-coding | **Deferred** — presentational (design-system territory)     |
| PRO-152 — `+Nms` event timestamps         | **Deferred** — Candidates list (blocked on PRO-62 backend)   |
| PRO-154 — replay + play/pause             | **Deferred** — Candidates list (unbuilt)                     |
