---
name: handle-ticket
description: Handle a Linear ticket end-to-end — fetch details, implement in a worktree, push a PR, get a subagent code review, write it to Obsidian, evaluate, and discuss
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

## 4 — Dev server checkpoint

If `$check` is non-empty (the user passed a second argument): invoke the `/run`
skill to start the UI or flix dev server (whichever you're working on) automatically. Do not use the default port; specify a different one and tell the user the actual URL. Wait for the user to confirm they are satisfied before continuing.

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

Create the PR. Include the ticket ID in parentheses at the end of the commit message and PR title: `fix(ui): bust virtualizer cache on mode change (PRO-126)`. This links the commit to the issue in Linear.

Note the PR number.

---

## 7 — Spawn a review subagent

Spawn a general-purpose subagent. Give it this exact prompt (substitute the
actual PR number):

> /review PR #<PR-number> for $ticket

Wait for the subagent to finish. Capture its complete output.

---

## 8 — Write the review to Obsidian

Write the subagent's review output **verbatim** to:

```
~/obsidian/protospy/Claude/Reviews/review-$ticket-pr-<PR-number>.md
```

Prepend a small YAML front matter block:

```yaml
---
ticket: $ticket
pr: <PR-number>
date: <today's date>
---
```

---

## 9 — Evaluate and discuss

Analyze the review:
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
