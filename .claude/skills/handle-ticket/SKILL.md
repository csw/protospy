---
name: handle-ticket
description: Handle a Linear ticket end-to-end — fetch details, implement in a worktree, visually verify UI changes, push a PR, run review rounds (code + convention + synthesis) written to Obsidian, evaluate, and discuss
argument-hint: PRO-NNN [directions…]
arguments: [ticket]
disable-model-invocation: true
---

Handle Linear ticket **$ticket** end-to-end. Work through the steps below in
order. Stop and surface blockers rather than guessing through them.

Read `docs/agents/linear.md` and `docs/agents/implementation.md` before
starting.

**Your directions.** Everything after the ticket ID is freeform direction for
this run. `$ARGUMENTS` is the full invocation as typed; the ticket ID is
`$ticket` and your directions are whatever follows it. These directions are
**authoritative** — where they extend or conflict with the standard flow below,
follow the directions. They exist so we can deviate from the default path ad hoc
— reuse an existing worktree, rebase onto `main`, push to an open PR or
deliberately open a fresh one, follow a ticket comment instead of the
description — without this skill having to anticipate every case. Honor them
throughout the steps that follow; the steps are the default path, not a
constraint your directions can't override. If a direction points you at a ticket
comment, read the comment thread, not just the description. If you pass no
directions, run the standard flow exactly as written.

---

## 1 — Fetch the ticket

```bash
linear issue view $ticket --json
```

Extract `title`, `description`, `url`, and `branchName`. Read the description
fully — it defines the scope of work. Save `title` and `url` (the Linear ticket URL) — both are needed when writing
review front matter in step 8. Derive the app URL by replacing the `https://`
scheme with `linear://` (e.g. `https://linear.app/...` → `linear://linear.app/...`).

**Branch name**: use `branchName` from Linear. If it exceeds 50 characters,
truncate the slug on a word boundary — keep the full `<type>/pro-NNN-` prefix
intact (Linear needs it for the GitHub integration). See `docs/agents/linear.md`
for the exact rule.

---

## 2 — Create a worktree

Call `EnterWorktree` with path `.claude/worktrees/<branch-name>`.

You do **not** need to pre-create the worktree, despite what the tool's own
description implies about `path` requiring an existing worktree. A project
`PreToolUse` hook (`scripts/hooks/enforce-worktree-path.sh`) creates it under
`.claude/worktrees/` first — on a branch named exactly `<branch-name>` so Linear's
GitHub integration links the PR. Do not pass `name` and do not run
`git worktree add` yourself; the hook owns placement and branch naming. (A legacy
`.worktrees/<branch-name>` path is still accepted and normalized to the canonical
location, but prefer `.claude/worktrees/`.)

All implementation, quality checks, commits, and pushes happen inside this
worktree.

---

## 3 — Implement

At this point, set the ticket to 'In Progress' in Linear.

Before writing any code:
- Read the relevant subproject's `CLAUDE.md` (e.g. `ui/CLAUDE.md` for UI work)
- Consult `docs/agents/` files relevant to the type of work

**Scope.** Read the ticket description, then construe scope broadly — this is a
requirement, not permission to decline. You **must** fix adjacent defects you
encounter in code you are already editing when the fix is the same nature and
similar magnitude as the ticket work: another bug in the same script you're
fixing, missing type coverage on a file you're touching, a typo in an adjacent
comment. Don't limit yourself to only the literal items enumerated in the
description — ticket scope defines the primary objective, not the boundary of
what you're allowed to touch.

Conversely, if you find something that warrants a fundamentally different
kind of work (a rewrite, a design change, a new dependency) or is much
larger than the ticket itself, note it in the PR description and move on.
Use `/pm:capture` for genuinely separate discoveries.

**Getting unstuck.** If you have made two unsuccessful attempts at the same
problem, or repeated the same approach without new information, stop and spawn a
`general-purpose` subagent (Opus model, high effort) via the Agent tool for a
fresh perspective. Brief it on what you've tried and what's not working. A
count-based trigger fires reliably — don't wait to "feel stuck." A second set of
eyes on a stuck problem is almost always faster than continuing to iterate in
the same direction.

Implement what the ticket calls for. Do **not** touch any Rust code.

When done, run the subproject's quality checks as listed in its `CLAUDE.md`.
Any code path you changed that isn't covered by the test suite must be executed
manually before proceeding (start a dev server, run the binary, etc.).

---

## 4 — Visually verify UI changes

**Trigger.** Run this step whenever the branch diff touches UI source. Check
with a three-dot diff against the merge-base:

```bash
git diff main...HEAD --name-only -- 'ui/src/**'
```

If that lists **no** files, skip this step and continue to step 5. If it lists
**any**, this step is **required** — do not open the PR on a UI change without a
visual confirmation.

This is a **lightweight, interactive** check — *look at what you built* — not
the full `visual-review` pipeline. No fixture-matrix sweep, no multi-width
screenshot matrix, no formal report. You spawn one subagent to drive the app
through the Playwright CLI and report back whether the change holds together.

**Start a dev server** for the subagent to drive, on a non-default port so it
doesn't collide with anything the user is running, and note the URL. Run it in
the background (e.g. `pnpm dev --port <port>` from `ui/`).

**Spawn a `general-purpose` subagent on Sonnet** (`model: sonnet`). Tell it to
drive the browser via the `playwright-cli` skill (it invokes the skill itself);
the prompt below is self-contained, so it needs no UI-specific preloading beyond
`ui/CLAUDE.md`, which it loads on reading any `ui/` file. Use Sonnet, not Opus:
eyeballing a rendered
change is not Opus-grade reasoning, and screenshots are token-heavy (~1.5k each),
so the cheaper model keeps this check inexpensive — the same reason the
`visual-review` agent is pinned to Sonnet. This is still the *lightweight* path:
a quick interactive eyeball, deliberately *not* the heavyweight `visual-review`
agent or its fixture-matrix sweep. Give it a prompt of this shape, naming the
components/views your change touched and the dev-server URL:

> Visually verify the UI changes for $ticket ("<title>"). The dev server is at
> `http://localhost:<port>/`. The change touched <components/views>. Use the
> `playwright-cli` skill to drive the app: navigate to the affected view(s) —
> inject fixture state via `window.__test_scenes.apply('<scene-id>')` where it
> helps you reach the right state — and check:
>
> - **Does it look right?** Layout holds; nothing overlaps, clips silently, or
>   misaligns; the change renders what it should.
> - **Does the layout hold at reasonable widths?** Spot-check 1280 and 1440
>   (`playwright-cli resize <w> 900`). Desktop only — do not go below 1280.
> - **Both themes.** Toggle dark and light via
>   `window.__test_store.getState().setTheme('dark')` / `'light'` and confirm
>   the change reads correctly in each.
> - **No new console errors** (`playwright-cli console`).
>
> Report a brief confirmation: what you checked, what looks right, and any
> issues (with a screenshot reference). Keep it short — this is a quick
> self-check, not a formal review.

If the subagent reports problems, fix them (you are still in the worktree),
re-run the relevant quality checks, and re-verify before continuing. Capture a
one-line summary of the verification to fold into the PR description (step 6).

This step is deliberately scoped to *your* change. It does **not** replace
`docs/frontend-dod.md` (the full Definition of Done) or the heavyweight
`visual-review` subagent (`.claude/agents/visual-review.md`) — neither is run
here.

---

## 5 — Commit and push

Commit with a Conventional Commits message:
- Subject: use the ticket title verbatim as the description, append `($ticket)`
  at the end — e.g. `fix(ui): improve header density (PRO-129)`
- Keep the full subject line under 72 characters; if needed, trim the
  description (not the ticket ID or type/scope prefix)
- Put any implementation notes in the commit body, not the subject

Push the branch.

---

## 6 — Create the PR

Create the PR. Include the ticket ID in parentheses at the end of the commit
message and PR title: `fix(ui): bust virtualizer cache on mode change
(PRO-126)`. This links the commit to the issue in Linear.

Note the PR number.

---

## 7 — Run a review round

Steps 7–9 are **one review round**. A round spawns the reviews (7), writes
each report to that round's numbered files (8), and synthesizes them (9). The
first time through is round 1. After you address findings and push fixes in
step 10, you come **back here** for round 2, round 3, and so on — each push of
fixes earns a fresh round so the new reports never clobber the old ones. The
round number `N` is assigned in step 8; everything written in a round shares
that `N`.

Two reviews can run here. The code review always runs; the convention review
runs only when the diff touches UI source.

### Maintainer review instructions (relay if present)

Before spawning the reviews, check the ticket description (fetched in step 1)
for a `## Reviewer instructions` section. If it exists, its body is
maintainer-authored guidance written for **this PR's** reviewers — relay it
**verbatim** into both the 7a and 7b prompts, appended as the block below. It
carries what a diff-scoped review can't infer on its own: a mechanism the PR
deliberately changes (so the reviewer doesn't flag the intended change as
drift), an area to scrutinize harder, or scope the maintainer has explicitly
bounded out (e.g. vendored code imported verbatim — don't code-review it). Treat
it as authoritative context for the review, not a finding to evaluate.

When the section exists, append this block to each reviewer prompt, filling in
its body verbatim:

> **Maintainer instructions for this review** (authoritative — context the diff
> can't show you; weigh accordingly):
>
> <verbatim body of the ticket's `## Reviewer instructions` section>

If the ticket has no `## Reviewer instructions` section, skip this — most
tickets won't have one.

### 7a — Code review (always)

Spawn a general-purpose subagent. Give it this exact prompt (substitute the
actual PR number):

> /review PR #<PR-number> for $ticket. In addition to the standard checks, for
> every test added or changed in this PR, verify it exercises the real
> production code path rather than standing in a different library, polyfill,
> runtime, or mock for it. Flag any divergent-path test that lacks a companion
> test on the real path (e.g. a unit test against a Node shim with no browser
> test covering the WASM path that ships). See `docs/agents/testing.md`, "Test
> the real production code path".

If the ticket carried a `## Reviewer instructions` section, append the
maintainer-instructions block (see *Maintainer review instructions* above) to
this prompt.

This catches correctness bugs and CLAUDE.md compliance. It does **not** apply
the React/Tailwind/shadcn convention checklists — that's what 7b is for. The
appended prod-vs-test-path check is here because "the unit tests pass" can hide
an entirely uncovered production path (PRO-205) — a correctness gap `/review`
won't surface unless prompted for it.

### 7b — Convention review (UI source or UI config diffs only)

Check whether the diff touches UI source **or** the Tailwind/shadcn config
files that carry convention surface (use a three-dot diff against the
merge-base):

```bash
git diff main...HEAD --name-only -- 'ui/src/**' 'ui/components.json' 'ui/*.config.*'
```

If that lists any files, spawn the **`convention-review` subagent**
(`subagent_type: "convention-review"`) in the **same message** as the 7a
code review so they run in parallel. Give it this prompt shape:

> Run a React/Tailwind/shadcn convention review for $ticket ("<title>").
> Linear URL: <url>. Scope from the diff against `main` (branch
> `<branch-name>`). Apply the frontend:react-patterns, frontend:shadcn-ui,
> and frontend:tailwind-theme-builder skills to the changed UI source and
> return your prioritized convention-findings report.

If the ticket carried a `## Reviewer instructions` section, append the
maintainer-instructions block (see *Maintainer review instructions* above) to
this prompt.

This is a read-only agent that audits convention drift (no-op tokens, missing
`cn()`, hand-rolled vs. shadcn primitives, hooks/effects footguns,
composition drift) — the recurring class of issue that `/review` structurally
suppresses (it filters out style/quality findings not mandated by CLAUDE.md).
See `.claude/agents/convention-review.md`.

If the diff matches **none** of those paths (no `ui/src/**`, `ui/components.json`,
or `ui/*.config.*` files), skip 7b — there are no React/Tailwind/shadcn
conventions to review.

Wait for both subagents to finish. Capture each one's complete output. If a
subagent fails or returns empty, note it and continue — the other review
still stands.

---

## 8 — Write reviews to Obsidian

### Establish the round and its paths

Call the path helper **once** to allocate this round's directory and the
filenames every report in the round will use:

```bash
scripts/agents/review-paths $ticket <PR-number>
```

It prints `round=<N>` and the absolute path for each report
(`code_review`, `convention_review`, `synthesis`) under
`~/obsidian/protospy/Claude/Reviews/$ticket-PR-<PR-number>/`. The first round
is `N=1`; a re-review after pushing fixes (step 10) is the next integer. Reuse
these exact paths for every write in this round — do **not** call the helper
again per file, or you will advance the round counter mid-round.

`scripts/agents/review-paths` is the single source of truth for review report
paths. The `review-synthesis` agent reads the same directory via the same
helper (`--current`); do not hand-roll these paths anywhere.

### Code review (always)

Write the code review subagent's output **verbatim** to the `code_review`
path. Prepend a front matter block and links list:

```yaml
---
ticket: $ticket
title: "<ticket title from step 1>"
pr: <PR-number>
round: <N>
date: <today's date>
type: code-review
---

- **Linear**: [$ticket](<url from step 1>) ([App: $ticket](<app-url from step 1>))
- **PR**: [#<PR-number>](https://github.com/csw/protospy/pull/<PR-number>)
```

### Convention review (only if 7b ran)

If a convention review ran in step 7b, write its findings to the
`convention_review` path. The report already includes its own YAML front
matter (`type: convention-review`, `title`, `scope`, `files_reviewed`,
`skills_applied`). Use it as the primary block; ensure `ticket`, `title`,
`pr`, `round`, and `date` are present, adding any that are missing.

After the merged front matter's closing `---`, insert a links list before
the first heading:

```
- **Linear**: [$ticket](<url from step 1>) ([App: $ticket](<app-url from step 1>))
- **PR**: [#<PR-number>](https://github.com/csw/protospy/pull/<PR-number>)
```

---

## 9 — Evaluate and discuss

Triage **every** review that ran: the code review (always) and the convention
review (UI source diffs, step 7b).

### 9a — Synthesize (when two or more reviews ran)

The reviews run **independently and blind to each other**, so the same issue
can surface twice with different framings, recommendations can conflict, and
severities are ranked on separate scales. When **two or more** reviews ran,
spawn the **`review-synthesis` subagent** (`subagent_type:
"review-synthesis"`) to reconcile them into one cross-aware triage. Give it:

- The ticket ID and PR number
- The round number `N` (so it reads this round's reports, not an older one)
- Which reviews ran (code / convention)

It reads this round's review reports written to Obsidian in step 8 and returns
a single merged triage: deduplicated, with same-root-cause findings linked
("one fix resolves both"), conflicts surfaced, and everything re-ranked
blocking vs. advisory on one scale. See `.claude/agents/review-synthesis.md`.

**Persist the synthesis.** The subagent is read-only, so write its returned
triage **verbatim** to this round's `synthesis` path (from the step-8
`review-paths` call), with a front matter block and links table:

```yaml
---
ticket: $ticket
title: "<ticket title from step 1>"
pr: <PR-number>
round: <N>
date: <today's date>
type: synthesis
---

- **Linear**: [$ticket](<url from step 1>) ([App: $ticket](<app-url from step 1>))
- **PR**: [#<PR-number>](https://github.com/csw/protospy/pull/<PR-number>)
```

This keeps the merged triage alongside the reports it reconciles, one
`synthesis-<N>.md` per round.

If only **one** review ran (e.g. a non-UI change, where just the code review
fires), skip synthesis — there is nothing to reconcile, and no `synthesis-<N>`
file is written. Present that review's findings directly using the triage
shape below.

### 9b — Record, present, and discuss

Assemble the triage (from 9a, or the single review's findings if synthesis was
skipped): group by **blocking** vs. **advisory**, note which review surfaced each
finding (code / convention), call out the cross-review links and any conflicts the
synthesis raised, and for each finding say whether you'd address it now or defer,
flagging anything low-signal, redundant, or likely incorrect.

**Post this triage as a ticket comment before you show it to the user.** Record the
review summary, the blocking/advisory triage, and your proposed course of action on
each finding as a Linear comment on $ticket — agent-header prefixed per
`docs/agents/linear.md` — and then present the same content in-session. Posting it
first makes the triage a durable, linkable record the moment it exists, so a case worth
a second opinion can be handed to the senior-pm agent (or revisited later) by pointing
at the ticket rather than digging through the transcript. This is in addition to the
close-out summary comment in step 10: that one records what shipped; this one records
the review findings and the decision still to be made.

Then invite the user to discuss: which findings to act on, which to push back
on, what to do next. Continue the conversation as long as the user wants.

---

## 10 — Address findings, then loop or close out

Make any changes the user wants to address from the review. You are still in
the worktree, so changes go directly on the branch. Commit and push each batch
of fixes; the open PR picks them up automatically.

This is the **revise half of the review cycle**. After pushing fixes there are
two ways forward:

### Run another review round (when fixes warrant a re-review)

After pushing fixes, ask the user whether to run another review round. Run one
(go **back to step 7**) if the user asks, or if the fixes changed program
behavior, touched more than a trivial number of lines, or addressed a blocking
finding. A pure comment/rename/formatting fix does not require a new round.
When you do run another round against the updated PR:

1. Re-spawn the code review (and the convention review, if the step-7b diff
   check still lists files) on the new diff.
2. In step 8, `scripts/agents/review-paths $ticket <PR-number>` now returns the
   **next** round number, so the new reports land as `code-review-2.md`,
   `synthesis-2.md`, and so on without touching round 1's files.
3. Synthesize and present again (step 9), then return here.

Repeat the round as many times as the review surfaces things worth fixing.

### Close out (when nothing is left to act on)

When the user is satisfied and there is nothing left to act on:

1. **Post a summary comment to the ticket.** This is the durable record of the
   run, required on completion (`docs/agents/linear.md`, "Post a summary comment
   when you finish"). Write a concise summary of $ticket's work and fold it into
   a Linear comment:

   > **Claude agent (handle-ticket)**
   >
   > _What changed_ — a short description of the work, linking the PR.
   >
   > _Key decisions and findings_ — what you decided and why; anything you
   > discovered that bears on the work.
   >
   > _Spillover_ — anything that affects or belongs to another ticket (name the
   > `PRO-NNN`), so a human sees it here rather than only in the transcript.

   Mirror the end-of-work summary you'd report in-session — include what a
   reader needs to understand the run without replaying the transcript, and no
   more. Post it with the agent-header above via
   `linear issue comment add $ticket --body-file <path>` (write the body with
   the Write tool first; `--body-file` is preferred for markdown). Skip only for
   trivial mechanical changes (use judgment); when in doubt, post one.
2. Call `ExitWorktree` to return to the main checkout.
