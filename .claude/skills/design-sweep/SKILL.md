---
name: design-sweep
description: >-
  Run a full visual-review sweep of the protospy UI across the entire fixture
  matrix, triage findings by severity, write a report to Obsidian, and drop a
  PM inbox note for ticket creation. Does not create tickets directly.
  Triggers: 'design sweep', 'full visual sweep', 'run the sweep',
  'visual sweep', 'run PRO-242', 'sweep the UI'.
compatibility: claude-code-only
---

# Full Design Sweep — protospy UI

Run the `visual-review` agent across the **entire** fixture matrix (all scenes
x all widths x both themes) and produce a triaged findings report. This is the
full-surface quality pass — the visual-review agent's "full sweep" mode,
orchestrated end-to-end.

**This skill does not create Linear tickets.** It writes a findings report to
Obsidian and drops a PM inbox note for the senior-pm to triage into
properly-shaped tickets.

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

### 2 — Run the visual-review agent (full sweep)

Spawn the `visual-review` agent for a full sweep. Use `name: "visual-review"`
so it stays addressable for follow-ups.

The screenshots directory for the sweep is date-stamped:

```bash
mkdir -p ~/obsidian/protospy/Claude/Reviews/screenshots/sweep-$(date +%Y-%m-%d)
```

Spawn prompt:

> Full sweep. Check all scenes at all 3 widths (1280, 1440, 1920) against the
> full rubric in both themes.
>
> Screenshots directory:
> `~/obsidian/protospy/Claude/Reviews/screenshots/sweep-YYYY-MM-DD/`
> (substitute today's date).

The agent returns a complete findings report as its final text.

### 3 — Write the report to Obsidian

Save the agent's findings report to:

```
~/obsidian/protospy/Claude/Reviews/design-review-YYYY-MM-DD.md
```

If a file already exists at that path (a previous sweep the same day), append
a sequence number: `design-review-YYYY-MM-DD-2.md`.

### 4 — Write a PM inbox note

Create a triage note at `~/obsidian/protospy/PM/Inbox/sweep-triage-YYYY-MM-DD.md`
summarizing the findings for the senior-pm to process into tickets:

```markdown
---
type: inbox
effort: ui-quality
tickets: []
updated: YYYY-MM-DD
---

# Visual sweep triage — YYYY-MM-DD

Full fixture-matrix sweep completed. Report:
[[Claude/Reviews/design-review-YYYY-MM-DD]]

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

### 5 — Report

Tell the user:

- Where the full report was written
- The finding counts by severity
- That a PM inbox note was created for ticket triage
- Any coverage gaps (scenes that couldn't be tested, fixture limitations)
