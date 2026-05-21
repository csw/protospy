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
