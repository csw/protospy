---
name: handle-ticket
description: Handle a Linear ticket end-to-end — fetch details, implement in a worktree, push a PR, run review rounds (code + visual + convention + synthesis) written to Obsidian, evaluate, and discuss
argument-hint: PRO-NNN [check]
arguments: [ticket, check]
disable-model-invocation: true
---

Handle Linear ticket **$ticket** end-to-end. Work through the steps below in
order. Stop and surface blockers rather than guessing through them.

Read `docs/agents/linear.md` and `docs/agents/implementation.md` before
starting.

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

**UI ticket detection**: query the ticket's labels via GraphQL:

```bash
linear api '{ issue(id: "$ticket") { labels { nodes { name } } } }' \
  | jq -e '.data.issue.labels.nodes | map(.name) | index("UI") != null'
```

If `jq -e` exits 0 (the expression evaluated to `true`), this is a **UI
ticket**. Note this for step 4 — it determines whether a visual review runs.

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

**Scope.** Read the ticket description and construe the scope to include
adjacent problems you encounter in the same code, unless they're of a
different nature or magnitude. If you're fixing a bug in a script and find
another bug in the same script, fix it. If you're adjusting type
configuration and a file is missing type coverage that's consistent with
the ticket's intent, include it. Don't limit yourself to only the literal
items enumerated in the description — ticket scope defines the primary
objective, not the boundary of what you're allowed to touch.

Conversely, if you find something that warrants a fundamentally different
kind of work (a rewrite, a design change, a new dependency) or is much
larger than the ticket itself, note it in the PR description and move on.
Use `/pm:capture` for genuinely separate discoveries.

**Getting unstuck.** If you've spent more than 5 minutes on the same
problem without making progress — rummaging through files, trying the same
approach repeatedly, or going in circles — stop and spawn an Opus subagent
for a fresh perspective. Brief it on what you've tried and what's not
working. A second set of eyes on a stuck problem is almost always faster
than continuing to iterate in the same direction.

Implement what the ticket calls for. Do **not** touch any Rust code.

When done, run the subproject's quality checks as listed in its `CLAUDE.md`.
Any code path you changed that isn't covered by the test suite must be executed
manually before proceeding (start a dev server, run the binary, etc.).

---

## 4 — Visual review / dev server checkpoint

This step runs differently for UI tickets and non-UI tickets.

### UI tickets

#### 4a — Start the dev server

Start the UI dev server on a port that **won't collide** with the Playwright
test suite's preview server (which runs during the pre-commit hook in step 5).
The Playwright suite hashes the worktree path to pick its port; offset by 1
so both can coexist:

```bash
pw_port=$((49152 + (16#$(echo -n "$(pwd)/ui/" | shasum -a 256 | cut -c1-4) % 16383)))
port=$((pw_port + 1))
cd ui && pnpm dev --port "$port" &
```

Wait for it to be ready (check that `http://localhost:$port/` responds). The
visual-review subagent needs a running app to screenshot the fixture matrix.

The dev server stays alive through step 9 so the visual-review agent can be
resumed for targeted follow-ups. It is cleaned up in step 10.

#### 4b — Determine review scope

Run `git diff main --name-only` and inspect the changed paths. Check whether
the diff touches **shared infrastructure** — any of:

- `ui/src/theme/tailwind.css` or `ui/src/theme/applyTheme*`
- `ui/src/components/ui/*` (shadcn primitives)
- Global layout components (`ui/src/App.tsx`, `ui/src/components/Layout*`)
- CSS custom-property definitions or design tokens

If any shared infrastructure changed, or the diff is broad enough that
file-to-component mapping covers most of the app, or the ticket description
or labels indicate a systemic change: request a **full sweep**.

Otherwise: let the subagent derive scope from the diff (it does this
automatically via its scope table in the agent definition).

Also extract **caller hints** from the ticket — component names, area keywords,
or explicit scope notes in the description. These supplement the diff-derived
scope.

#### 4c — Spawn the visual-review subagent

Spawn a subagent with `subagent_type: "visual-review"` and `name:
"visual-review"` (so it can be resumed for targeted follow-ups in step 9
via `SendMessage`). Include in the prompt:

- The ticket ID (`$ticket`)
- The ticket title and Linear URL (from step 1), so the subagent includes
  `title` in its front matter
- The dev server URL (e.g. `http://localhost:5174/`)
- Whether to run a full sweep (if shared infrastructure was touched)
- Any caller hints extracted from the ticket description
- The branch name (so it can diff against main)
- The screenshots directory — compute it once with
  `scripts/agents/review-paths $ticket --screenshots` and pass the printed
  path. It is ticket-scoped (not PR-scoped) because the PR does not exist
  yet at this point; screenshots are temporary scratch, not round artifacts.

Example prompt shape:

> Run a visual review for $ticket ("<title>"). Linear URL: <url>.
> The dev server is at http://localhost:5174/.
>
> [If full sweep]: The diff touches shared infrastructure (<list files>).
> Run a full sweep — all scenes, all widths, full rubric.
>
> [If scoped]: Scope the review from the diff. Additional context from the
> ticket: <caller hints if any>.

Wait for the subagent to finish. **Save its findings report** — you will need
it in steps 8 and 9. If the subagent fails or returns an empty report (e.g.
dev server not responding, playwright-cli issues, no scenes found), note the
failure and continue to step 5 — the code review in step 7 still runs.

#### 4d — Handle `$check`

**If `$check` is set**: present the screenshots from the visual review to the
user. The screenshots are at
`~/obsidian/protospy/Claude/Reviews/screenshots/$ticket/` (the path the
visual-review agent was given in step 4c). Read a representative
subset of the screenshot images (the most relevant scenes for the change) and
show them to the user. State-store-injected conditions may not be reproducible
interactively, so screenshots from the fixture matrix are better than a live
URL for UI tickets. Wait for the user to confirm they are satisfied before
continuing.

**If `$check` is empty**: continue to step 5.

### Non-UI tickets

If `$check` is non-empty (the user passed a second argument): invoke the `/run`
skill to start the UI or flix dev server (whichever you're working on)
automatically. Do not use the default port; specify a different one and tell the
user the actual URL. Wait for the user to confirm they are satisfied before
continuing.

If `$check` is empty: skip this step entirely and continue to step 5.

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

Two reviews are spawned here. The first always runs; the second runs only when
the diff touches UI source. (The visual review already ran in step 4c for
round 1; on later rounds you re-check it by resuming that agent — see step 10.)

### 7a — Code review (always)

Spawn a general-purpose subagent. Give it this exact prompt (substitute the
actual PR number):

> /review PR #<PR-number> for $ticket

This catches correctness bugs and CLAUDE.md compliance. It does **not** apply
the React/Tailwind/shadcn convention checklists — that's what 7b is for.

### 7b — Convention review (UI source diffs only)

Check whether the diff touches UI source:

```bash
git diff main --name-only -- 'ui/src/**'
```

If that lists any files, spawn the **`convention-review` subagent**
(`subagent_type: "convention-review"`) in the **same message** as the 7a
code review so they run in parallel. Give it this prompt shape:

> Run a React/Tailwind/shadcn convention review for $ticket ("<title>").
> Linear URL: <url>. Scope from the diff against `main` (branch
> `<branch-name>`). Apply the frontend:react-patterns, frontend:shadcn-ui,
> and frontend:tailwind-theme-builder skills to the changed UI source and
> return your prioritized convention-findings report.

This is a read-only agent that audits convention drift (no-op tokens, missing
`cn()`, hand-rolled vs. shadcn primitives, hooks/effects footguns,
composition drift) — the recurring class of issue that `/review` structurally
suppresses (it filters out style/quality findings not mandated by CLAUDE.md).
See `.claude/agents/convention-review.md`.

If the diff touches **no** `ui/src/**` files, skip 7b — there are no
React/Tailwind/shadcn conventions to review.

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
(`code_review`, `visual_review`, `convention_review`, `synthesis`) under
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

### Visual review (UI tickets only)

If this is a UI ticket, also write the visual-review findings (saved from
step 4c) to the `visual_review` path. The visual-review report already
includes its own YAML front matter (`title`, `scope`, `scenes_checked`,
`widths`, `themes`). Use the subagent's front matter block as the primary
block. Ensure `ticket`, `title`, `pr`, `round`, and `date` are present; add
them if missing. Do not duplicate fields the subagent already provides.

After the merged front matter's closing `---`, insert a links list before
the first heading:

```
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

Triage **every** review that ran: the code review (always), the visual
review (UI tickets, step 4c), and the convention review (UI source diffs,
step 7b). A non-UI-labeled ticket that still touched `ui/src/**` has a
convention review to fold in even though it has no visual review.

### 9a — Synthesize (when two or more reviews ran)

The reviews run **independently and blind to each other**, so the same issue
can surface twice with different framings, recommendations can conflict, and
severities are ranked on separate scales. When **two or more** reviews ran,
spawn the **`review-synthesis` subagent** (`subagent_type:
"review-synthesis"`) to reconcile them into one cross-aware triage. Give it:

- The ticket ID and PR number
- The round number `N` (so it reads this round's reports, not an older one)
- Which reviews ran (code / visual / convention)

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

### 9b — Present and discuss

Present the merged triage (from 9a, or the single review's findings if
synthesis was skipped). Group by **blocking** vs. **advisory**, note which
review surfaced each finding (code / visual / convention), and call out the
cross-review links and any conflicts the synthesis raised. For each finding,
say whether you'd address it now or defer, and flag anything low-signal,
redundant, or likely incorrect.

Then invite the user to discuss: which findings to act on, which to push back
on, what to do next. Continue the conversation as long as the user wants.

### Visual-review follow-up

If a `visual-review` agent was spawned in step 4c, it is still addressable
via `SendMessage(to: "visual-review", ...)`. The dev server from step 4a is
still running, so the agent can screenshot immediately. The user can request
a targeted re-check — e.g. "re-check table mode at 1280" — and you resume
the existing agent instead of spawning a fresh one. The agent retains its
prior context (references, scope, screenshots, findings) so the follow-up
is scoped and cheap. See the "Resumable follow-up" section in the
`visual-review` agent definition for details.

---

## 10 — Address findings, then loop or close out

Make any changes the user wants to address from the review. You are still in
the worktree, so changes go directly on the branch. Commit and push each batch
of fixes; the open PR picks them up automatically.

This is the **revise half of the review cycle**. After pushing fixes there are
two ways forward:

### Run another review round (when fixes warrant a re-review)

If the fixes were substantive — or the user asks to re-review — go **back to
step 7** and run another round against the updated PR:

1. Re-spawn the code review (and the convention review, if `ui/src/**` still
   has changes) on the new diff.
2. **Re-check the visual side by resuming the existing agent**, not spawning a
   fresh one: `SendMessage(to: "visual-review", ...)` with a targeted request
   (e.g. "the spacing fix landed — re-check table mode at 1280"). The dev
   server from step 4a is still up, so it can screenshot immediately, and it
   keeps its prior context (see step 9's "Visual-review follow-up"). New
   screenshots reuse the same ticket-scoped directory.
3. In step 8, `scripts/agents/review-paths $ticket <PR-number>` now returns the
   **next** round number, so the new reports land as `code-review-2.md`,
   `synthesis-2.md`, and so on without touching round 1's files.
4. Synthesize and present again (step 9), then return here.

Repeat the round as many times as the review surfaces things worth fixing.

### Close out (when nothing is left to act on)

When the user is satisfied and there is nothing left to act on:

1. **Kill the dev server** if one is still running from step 4a.
2. Call `ExitWorktree` to return to the main checkout.
