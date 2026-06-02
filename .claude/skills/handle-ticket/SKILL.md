---
name: handle-ticket
description: Handle a Linear ticket end-to-end — fetch details, implement in a worktree, push a PR, get code + visual reviews, write them to Obsidian, evaluate, and discuss
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

Extract `title`, `description`, and `branchName`. Read the description fully —
it defines the scope of work.

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

Call `EnterWorktree` with path `.worktrees/<branch-name>`.

You do **not** need to pre-create the worktree, despite what the tool's own
description implies about `path` requiring an existing worktree. A project
`PreToolUse` hook (`scripts/hooks/enforce-worktree-path.sh`) creates it under
`.worktrees/` first — on a branch named exactly `<branch-name>` so Linear's
GitHub integration links the PR. Do not pass `name` and do not run
`git worktree add` yourself; the hook owns placement and branch naming.

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

Start the UI dev server on a non-default port (avoid 5173, which is the Vite
default). Pick an available port — check with `lsof -i :<port>` first if
unsure. Example:

```bash
cd ui && pnpm dev --port 5174 &
```

Wait for it to be ready (check that the chosen URL responds). The
visual-review subagent needs a running app to screenshot the fixture matrix.

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

Spawn a subagent with `subagent_type: "visual-review"`. Include in the prompt:

- The ticket ID (`$ticket`)
- The dev server URL (e.g. `http://localhost:5174/`)
- Whether to run a full sweep (if shared infrastructure was touched)
- Any caller hints extracted from the ticket description
- The branch name (so it can diff against main)

Example prompt shape:

> Run a visual review for $ticket. The dev server is at http://localhost:5174/.
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

#### 4d — Stop the dev server

Kill the background dev server process before proceeding.

#### 4e — Handle `$check`

**If `$check` is set**: present the screenshots from the visual review to the
user. The screenshots are at
`~/obsidian/protospy/Claude/screenshots/visual-review/`. Read a representative
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

## 7 — Spawn a code review subagent

Spawn a general-purpose subagent. Give it this exact prompt (substitute the
actual PR number):

> /review PR #<PR-number> for $ticket

Wait for the subagent to finish. Capture its complete output.

---

## 8 — Write reviews to Obsidian

### Code review (always)

Write the code review subagent's output **verbatim** to:

```
~/obsidian/protospy/Claude/Reviews/review-$ticket-pr-<PR-number>.md
```

Prepend a small YAML front matter block:

```yaml
---
ticket: $ticket
pr: <PR-number>
date: <today's date>
type: code-review
---
```

### Visual review (UI tickets only)

If this is a UI ticket, also write the visual-review findings (saved from
step 4c) to:

```
~/obsidian/protospy/Claude/Reviews/review-design-$ticket-pr-<PR-number>.md
```

Prepend front matter:

```yaml
---
ticket: $ticket
pr: <PR-number>
date: <today's date>
type: visual-review
---
```

The visual-review report already includes its own YAML front matter (`scope`,
`scenes_checked`, `widths`, `themes`). Use the subagent's front matter block as
the primary block. Ensure `ticket`, `pr`, and `date` are present; add them if
missing. Do not duplicate fields the subagent already provides.

---

## 9 — Evaluate and discuss

### UI tickets — combined triage

Merge the code-review and visual-review findings into a single triage. For each
finding from either review:

- Is it **blocking** (correctness bugs, spec violations, security issues,
  high-severity visual defects)?
- Is it **advisory** (style nits, minor improvements, low-severity visual
  polish)?
- Would you address it immediately or defer to a follow-up?
- Does it appear low-signal, redundant across the two reviews, or likely
  incorrect?

Present the merged analysis in a clear structure — group by blocking vs.
advisory, noting which review surfaced each finding. Then invite the user to
discuss.

### Non-UI tickets

Analyze the code review:
- Which findings are **blocking** (correctness, spec violations, security)?
- Which are **advisory** (style, minor improvements, nice-to-haves)?
- Which would you address immediately vs. defer to a follow-up?
- Any findings that appear low-signal, redundant, or likely incorrect?

Present this analysis clearly. Then invite the user to discuss: which findings
to act on, which to push back on, what to do next. Continue the conversation
as long as the user wants.

---

## 10 — Address findings and close out

Make any changes the user wants to address from the review. You are still in
the worktree, so changes go directly on the branch. Commit and push each
round of fixes; the open PR picks them up automatically.

When the user is satisfied and there is nothing left to act on, call
`ExitWorktree` to return to the main checkout.
