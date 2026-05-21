# Linear

This project uses Linear for issue tracking. The team key is `PRO`, so issue IDs take the form `PRO-NNN` (e.g. `PRO-50`). When the user references a ticket like `PRO-50`, it is a Linear issue identifier.

The `linear` CLI is available and authenticated. A wrapper at `~/bin/linear` ensures it works inside the Claude Code sandbox (the Deno HTTP client used by the CLI conflicts with the sandbox's SOCKS5 proxy; the wrapper strips `ALL_PROXY` so traffic routes through the HTTP proxy instead).

For full CLI documentation, invoke the `linear-cli` skill.

## Read-only access — what you can and cannot do

The CLI is configured with **read-only access**. You can look up issue
details but you cannot create, update, or close issues via the API.

Do not attempt `linear issue update`, `linear issue create`, or any
write operation. They will fail with a scope error.

**To close or update an issue**: link your work via commit messages or
PR descriptions (see "Linking work to issues" below). Linear's GitHub
integration handles status transitions automatically — branch push
moves issues to In Progress, merge moves them to Done.

**To create a new issue**: use `/pm:capture` with a short description.
This routes through the project's PM agent, which handles labeling,
project assignment, deduplication, and ticket shaping. Use this for
separate discoveries (a bug you stumbled across, a missing test, a new
issue) — not for scope questions about your current task, which should
go to the user interactively.

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
