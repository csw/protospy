# Linear

This project uses Linear for issue tracking. The team key is `PRO`, so issue IDs take the form `PRO-NNN` (e.g. `PRO-50`). When the user references a ticket like `PRO-50`, it is a Linear issue identifier.

The `linear` CLI is available and authenticated. The `api.linear.app` domain is allowlisted in `.claude/settings.json`, so no sandbox bypass is needed.

For full CLI documentation, invoke the `linear-cli` skill.

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

## Creating and updating issues

Do not create or update Linear issues directly. The CLI is configured
with read-only access.

If you discover something ticket-worthy that is separate from your
current task (a bug you stumbled across, a missing test, a new issue),
use `/pm:capture` with a short description. This routes through the
project's PM agent, which handles labeling, project assignment,
deduplication, and ticket shaping.

If you have a question about the scope or intent of the work you are
currently doing, ask the user directly. Do not use `/pm:capture` as a
substitute for interactive clarification.

To link your work to an existing issue, use commit message magic words
(see above). Linear's GitHub integration handles status transitions
automatically — branch push moves issues to In Progress, merge moves
them to Done.
