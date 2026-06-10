---
name: handle-ticket
description: Dispatch a Linear ticket into the right isolated worktree workflow, then run handle-ticket-inner. Use this public entry point for PRO-NNN ticket work instead of invoking handle-ticket-inner directly.
argument-hint: PRO-NNN [directions...]
arguments: [ticket]
disable-model-invocation: true
---

Dispatch Linear ticket **$ticket** into an isolated worktree-backed execution
thread, then run `$handle-ticket-inner $ARGUMENTS` there. This public skill owns
placement and harness setup. The inner skill owns implementation, verification,
commit, PR, review, and close-out.

Read `docs/agents/prompt-authoring.md` only if you modify this skill. For normal
ticket execution, the implementation guide is read by `handle-ticket-inner`.

## 1 — Fetch the ticket and branch

```bash
linear issue view $ticket --json
```

Extract `title`, `description`, `url`, and `branchName`. If the issue has a
parent or children, follow the Linear-ticket guidance in `AGENTS.md`: read the
parent and inspect sibling titles before dispatching. If a sibling title suggests
it bears on this work, open that sibling before continuing.

Use `branchName` from Linear. If it exceeds 50 characters, truncate the slug on
a word boundary while keeping the full `<type>/pro-NNN-` prefix intact. If
Linear does not return a usable branch name, use
`codex/pro-NNN-short-title-slug`.

## 2 — Dispatch by harness

### Codex

Ticket implementation must run in a Codex app worktree-backed thread.

If this thread is already running in a Codex app worktree, continue in this
thread by following `$handle-ticket-inner $ARGUMENTS`. If the app UI does not
make the environment obvious, use Git's worktree metadata to distinguish a
linked worktree from the main/local checkout.

If this thread is not running in a Codex app worktree, create a worktree-backed
thread and continue there:

- If `create_thread`, `fork_thread`, or `send_message_to_thread` is needed but
  not currently callable, use `tool_search` to expose the thread tool first.
- Prefer `create_thread` when the current Codex project id is available: create
  a project thread with `target.environment.type = "worktree"`,
  `startingState = { type: "working-tree" }`, and prompt it to run
  `$handle-ticket-inner $ARGUMENTS`.
- Otherwise use `fork_thread` with `environment: { type: "worktree",
  startingState: { type: "working-tree" } }`.
- Do not use the ticket branch as the worktree `startingState` unless that
  branch already exists and the directions say to reuse it. The inner skill
  creates or checks out the ticket branch inside the worktree.
- If `fork_thread` returns a child `threadId`, immediately call
  `send_message_to_thread` with a prompt to run `$handle-ticket-inner
  $ARGUMENTS`.
- If worktree setup is pending and no child `threadId` is available yet, stop
  work in this thread and tell the user to continue in the created
  worktree-backed thread with `$handle-ticket-inner $ARGUMENTS`.

Do not fall back to implementing in the main/local checkout. Do not assume a
fixed filesystem path such as `.Codex/worktrees/`, and do not run
`git worktree add` yourself.

### Claude Code

Call `EnterWorktree` with path `.claude/worktrees/<branch-name>`.

You do **not** need to pre-create the worktree, despite what the tool's own
description implies about `path` requiring an existing worktree. A project
`PreToolUse` hook (`scripts/hooks/enforce-worktree-path.sh`) creates it under
`.claude/worktrees/` first, on a branch named exactly `<branch-name>` so Linear's
GitHub integration links the PR. Do not pass `name` and do not run
`git worktree add` yourself; the hook owns placement and branch naming.

After entering the worktree, continue in the same thread by following
`$handle-ticket-inner $ARGUMENTS`.
