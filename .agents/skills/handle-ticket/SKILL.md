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

In Codex CLI, the preferred public entry point is
`just codex-ticket $ARGUMENTS`. That wrapper creates the Git worktree and starts
a fresh Codex CLI session inside it. If this skill is invoked directly from the
main checkout, stop with that command instead of implementing in place.

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

### Codex CLI

Ticket implementation must run in a linked Git worktree on the ticket branch.

If this session is already running in a linked Git worktree, continue in this
session by following `$handle-ticket-inner $ARGUMENTS`. Use Git's worktree
metadata to distinguish a linked worktree from the main/local checkout:

```bash
git rev-parse --show-toplevel
git rev-parse --git-dir
git rev-parse --git-common-dir
git worktree list --porcelain
```

In a linked worktree, `git rev-parse --git-dir` differs from
`git rev-parse --git-common-dir`.

If this session is in the main/local checkout, do not create a worktree from
inside the active Codex turn and do not launch a nested Codex TUI. Stop and tell
the user:

- the ticket title, URL, and branch name you fetched;
- to run this from a normal shell:

```bash
just codex-ticket $ARGUMENTS
```

The public entry point is `just codex-ticket`. It invokes the repo wrapper
`scripts/agents/codex-ticket`, which owns the Codex CLI dispatch: it reads
Linear, truncates Linear's branch name to 50 characters on a word boundary,
creates or reuses `.worktrees/<branch-slug>` on that branch, then starts
`codex -C <worktree> '$handle-ticket-inner $ARGUMENTS'`.

Everything after the ticket that is not a wrapper option is passed through to
`handle-ticket-inner` as run-specific directions. For longer or shell-sensitive
directions, use `-i/--instructions` (repeatable):

```bash
just codex-ticket PRO-123 but skip the visual review
just codex-ticket PRO-123 -i "skip the visual review"
```

To create or resume an alternative branch/worktree derived from Linear's branch,
use `-v/--version`. This appends the version to the ticket branch while preserving
the `PRO-NNN` prefix and 50-character branch limit:

```bash
just codex-ticket PRO-123 -v 2
just codex-ticket PRO-123 --version 2
```

When `-v/--version`, `--branch`, or `--worktree` selects a branch/worktree, that
selection is authoritative for the run. The inner workflow must stay on that
branch and must not continue, repair, push to, or create a PR from another
ticket branch unless the user explicitly asks for that branch.
If the user says to start fresh, that means ignore prior branches and PRs for
the ticket and proceed independently on the selected branch/worktree. Do not
inspect or use other ticket-linked branches or PRs unless the user explicitly
names that branch or PR.

To resume or create a manually named branch, pass it exactly:

```bash
just codex-ticket PRO-123 --branch codex/pro-123-manual-alt
```

To enter a specific existing worktree path, pass `--worktree`. If the path
already exists and no branch/version option is supplied, the wrapper uses that
worktree's current branch:

```bash
just codex-ticket PRO-123 --worktree .worktrees/pro-123-manual-alt
```

Pass Codex launch options through the wrapper when needed. Use `--effort` for
the common reasoning-effort case, or put raw Codex CLI args after `--`:

```bash
just codex-ticket PRO-123 -e xhigh
just codex-ticket PRO-123 -- -c model_reasoning_effort=\"xhigh\"
```

Do not fall back to implementing in the main/local checkout.

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
