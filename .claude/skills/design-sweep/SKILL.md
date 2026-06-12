---
name: design-sweep
description: >-
  Run a visual-review sweep of the protospy UI across the fixture matrix,
  triage findings by severity, write a report to Obsidian, and drop a PM
  inbox note for ticket creation. Supports full sweeps and scoped runs
  (by scene, width, or rubric). Does not create tickets directly.
  Triggers: 'design sweep', 'full visual sweep', 'run the sweep',
  'visual sweep', 'sweep the UI', 'sweep scene X', 'sweep at 1024'.
compatibility: claude-code-only
---

# Design Sweep — protospy UI

Run the `visual-review` agent across the fixture matrix and produce a triaged
findings report. Supports full sweeps and scoped runs.

**This skill does not create Linear tickets.** It writes a findings report to
Obsidian and drops a PM inbox note for the senior-pm to triage into
properly-shaped tickets.

## Scope from arguments

Parse `$ARGUMENTS` (everything after `/design-sweep`) to determine scope.
When no arguments are given, run a **full sweep** (all scenes x all widths x
both themes). Arguments narrow the scope:

- **Scene names**: `selected`, `long-error`, `stream-anthropic`, etc. — run
  only those scenes. Multiple scenes can be space-separated.
- **Widths**: `1024`, `1280`, `1440`, `1920` — run only at those widths.
  When no width is specified, use the standard set (1280/1440/1920).
- **Rubric focus**: `layout`, `contrast`, `typography`, `responsive`, etc. —
  emphasize those rubric categories.
- **`full`**: explicit full sweep (the default when no args are given).

Examples:

- `/design-sweep` — full sweep, all scenes, all standard widths, both themes
- `/design-sweep selected long-error 1024` — two scenes at 1024px
- `/design-sweep stream-anthropic contrast` — one scene, contrast emphasis
- `/design-sweep 1024 1280` — full scene set at two widths
- `/design-sweep light` — full sweep, light theme only

Combine freely. The skill builds a prompt for the visual-review agent from
whatever is specified.

## Procedure

### 1 — Ensure the dev server is running

The fixture matrix requires `window.__test_scenes`, available in dev mode.
Check whether a dev server is already running:

```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/ 2>/dev/null
```

If no server is responding, start one:

```bash
(cd ui && pnpm dev --port 5173) &
```

Wait for it to be ready before proceeding. Confirm the test harness is
available:

```bash
playwright-cli open
playwright-cli goto http://localhost:5173/
playwright-cli eval "typeof window.__test_scenes !== 'undefined'"
```

If `__test_scenes` is not available, stop and report — the sweep cannot run
without the fixture harness.

### 2 — Build the visual-review prompt

From the parsed arguments, construct the spawn prompt for the visual-review
agent:

**Full sweep** (no scene/width args):

> Full sweep. Check all scenes at all widths against the full rubric in both
> themes.

**Scoped run** (scenes and/or widths specified):

> Check scenes: [scene list]. Widths: [width list]. Themes: [both / light /
>
> > dark]. Rubric emphasis: [categories, or "full rubric"].

Always include the screenshots directory path (see step 3).

### 3 — Run the visual-review agent

Create the screenshots directory:

```bash
mkdir -p ~/obsidian/protospy/Claude/Reviews/screenshots/sweep-$(date +%Y-%m-%d)
```

Spawn the `visual-review` agent with `name: "visual-review"` so it stays
addressable for follow-ups. Append the screenshots directory to the prompt:

> Screenshots directory:
> `~/obsidian/protospy/Claude/Reviews/screenshots/sweep-YYYY-MM-DD/`

The agent returns a findings report as its final text.

### 4 — Write the report to Obsidian

For a **full sweep**, save to:

```
~/obsidian/protospy/Claude/Reviews/design-review-YYYY-MM-DD.md
```

For a **scoped run**, include the scope in the filename:

```
~/obsidian/protospy/Claude/Reviews/design-review-YYYY-MM-DD-<scope-slug>.md
```

Where `<scope-slug>` is a short kebab-case summary of what was scoped (e.g.
`selected-1024`, `stream-scenes`, `light-mode`).

If a file already exists at that path, append a sequence number.

### 5 — Write a PM inbox note

Create a triage note at
`~/obsidian/protospy/PM/Inbox/sweep-triage-YYYY-MM-DD.md`:

```markdown
---
type: inbox
effort: ui-quality
tickets: []
updated: YYYY-MM-DD
---

# Visual sweep triage — YYYY-MM-DD

<"Full fixture-matrix sweep" or "Scoped sweep: [description]"> completed.
Report: [[Claude/Reviews/design-review-YYYY-MM-DD]]

## Summary

<One paragraph: how many findings at each severity, the top 3 issues, any
coverage gaps or scenes that could not be tested.>

## Findings to ticket

<List each High and Medium finding with its ID (H1, M1, etc.), a one-line
summary, and suggested priority. Lows can be batched.>

## Notes

<Any observations about the sweep itself: scenes that need adding, fixture
gaps encountered, things that looked good.>
```

For small scoped runs (one or two scenes, few findings), the inbox note can
be proportionally brief — don't pad a two-finding scoped check to match the
full-sweep template.

### 6 — Report

Tell the user:

- Where the full report was written
- The finding counts by severity
- That a PM inbox note was created for ticket triage
- Any coverage gaps (scenes that couldn't be tested, fixture limitations)
- That the visual-review agent is still addressable for follow-ups
  (`SendMessage` to `"visual-review"`)
