---
name: handle-ticket
description: Dispatch a Linear ticket into the Claude Code worktree workflow, then run handle-ticket-inner. Use this public entry point for PRO-NNN ticket work instead of invoking handle-ticket-inner directly.
argument-hint: PRO-NNN [directions...]
arguments: [ticket]
disable-model-invocation: true
---

Dispatch Linear ticket **$ticket** into an isolated Claude Code worktree, then
run `$handle-ticket-inner $ARGUMENTS` there. This public skill owns placement and
worktree setup. The inner skill owns implementation, verification, commit, PR,
review, and close-out.

Read `docs/agents/prompt-authoring.md` only if you modify this skill. For normal
ticket execution, the implementation guide is read by `handle-ticket-inner`.

## 1 — Fetch the ticket and branch

```bash
linear issue view $ticket --json
```

Extract `title`, `description`, `url`, and `branchName`. If the issue has a
parent or children, follow the Linear-ticket guidance in `CLAUDE.md`: read the
parent and inspect sibling titles before dispatching. If a sibling title suggests
it bears on this work, open that sibling before continuing.

Use `branchName` from Linear. If it exceeds 50 characters, truncate the slug on
a word boundary while keeping the full `<type>/pro-NNN-` prefix intact. If
Linear does not return a usable branch name, use
`codex/pro-NNN-short-title-slug`.

## 2 — Enter the worktree

Call `EnterWorktree` with path `.claude/worktrees/<branch-name>`.

You do **not** need to pre-create the worktree, despite what the tool's own
description implies about `path` requiring an existing worktree. A project
`PreToolUse` hook (`scripts/hooks/enforce-worktree-path.sh`) creates it under
`.claude/worktrees/` first, on a branch named exactly `<branch-name>` so Linear's
GitHub integration links the PR. Do not pass `name` and do not run
`git worktree add` yourself; the hook owns placement and branch naming. A legacy
`.worktrees/<branch-name>` path is still accepted and normalized to the canonical
location, but prefer `.claude/worktrees/`.

After entering the worktree, continue in the same thread by invoking
`$handle-ticket-inner $ARGUMENTS`.
