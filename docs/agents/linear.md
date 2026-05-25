# Linear

This project uses Linear for issue tracking. The team key is `PRO`, so issue IDs take the form `PRO-NNN` (e.g. `PRO-50`). When the user references a ticket like `PRO-50`, it is a Linear issue identifier.

The `linear` CLI is available and authenticated via `LINEAR_API_KEY`; invoke it directly. (On the host macOS sandbox a `~/bin/linear` wrapper is used instead — see `host-sandbox.md`.)

For full CLI documentation, invoke the `linear-cli` skill.

## What you can and cannot do

The CLI has **read-write access**. You can look up and update issues.

**Do:**
- Move an issue to In Progress when you start working on it:
  `linear issue update PRO-NNN --state "In Progress"`
- Add comments to issues when you have useful context to record
- Look up issue details, branch names, status

**Don't:**
- Close issues or move them to Done. Let the GitHub integration handle
  that on PR merge (see "Linking work to issues" below).
- Create issues directly. Use `/pm:capture` with a short description —
  this routes through the PM agent for labeling, deduplication, and
  ticket shaping. Use it for separate discoveries (a bug you stumbled
  across, a missing test, a new issue) — not for scope questions about
  your current task, which should go to the user interactively.
- Change labels, priority, or project assignment without being asked.

## Branch naming

When creating a branch or worktree for a Linear issue, **start from the branch name Linear suggests**, then truncate if needed:

```bash
linear issue view PRO-NNN --json | jq -r .branchName
```

Linear's branch names include the issue ID (e.g. `feature/pro-136-give-agents-instructions-on-where-to-put-worktrees`), which is what triggers the GitHub integration that moves issues through their workflow.

**If the branch name exceeds 50 characters**, truncate the slug portion on a word boundary. Keep the `<type>/pro-NNN-` prefix intact — that's what Linear needs for linking. Example:

- Full: `feature/pro-136-give-agents-instructions-on-where-to-put-worktrees`
- Truncated: `feature/pro-136-give-agents-instructions`

Pass the result as the branch name to `EnterWorktree` or `git worktree add`.

## Getting issue details

```bash
linear issue view PRO-NNN --json
```

Useful fields and how to extract them with jq:

```bash
# Branch name (Linear's suggested git branch for this issue)
linear issue view PRO-NNN --json | jq -r .branchName

# State (e.g. "Todo", "In Progress", "Done")
linear issue view PRO-NNN --json | jq -r .state.name

# Assignee
linear issue view PRO-NNN --json | jq -r .assignee.name

# Project and milestone
linear issue view PRO-NNN --json | jq -r .project.name
linear issue view PRO-NNN --json | jq -r .projectMilestone.name

# Parent issue identifier (null if top-level)
linear issue view PRO-NNN --json | jq -r .parent.identifier

# Child issue identifiers (note: nested under .nodes, not a bare array)
linear issue view PRO-NNN --json | jq -r '.children.nodes[].identifier'

# Priority (0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low)
linear issue view PRO-NNN --json | jq .priority
```

Top-level fields present in the JSON: `identifier`, `title`, `description`, `url`, `branchName`, `state`, `assignee`, `priority`, `project`, `projectMilestone`, `cycle`, `parent`, `children`, `comments`, `attachments`, `documents`.

## Linking work to issues

This is how issues get moved through their workflow. There is no API
path for status changes — commit and PR linking is the mechanism.

When working on a branch that covers a single issue, the branch name
handles linking automatically (branch names include the issue ID).

When a branch covers multiple issues, there are two linking mechanisms.
Use whichever fits the shape of the work.

### Commit messages

Link individual commits to issues using a magic word in the commit body
or footer:

    test(conformance): relax exact-match assertions for hop-by-hop headers

    fixes PRO-107

### PR descriptions

When multiple issues are resolved by a single PR and the fix granularity
doesn't map to individual commits, list them in the PR description:

    fixes PRO-107, PRO-109, PRO-104
    refs PRO-110

### Choosing `fixes` vs `refs`

Use `fixes` when the commit or PR fully resolves the issue — Linear will
move it to Done on merge. Use `refs` when the work is partial progress
or related but doesn't complete the issue. Use your judgment; most work
that directly addresses a ticket will be `fixes`.
