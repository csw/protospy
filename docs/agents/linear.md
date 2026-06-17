# Linear

This project uses Linear for issue tracking. The team key is `PRO`, so issue IDs take the form `PRO-NNN` (e.g. `PRO-50`). When the user references a ticket like `PRO-50`, it is a Linear issue identifier.

The `linear` CLI is available and authenticated via `LINEAR_API_KEY`; invoke it directly. (On the host macOS sandbox a `~/bin/linear` wrapper is used instead — see `host-sandbox.md`.)

For full CLI documentation, invoke the `linear-cli` skill.

## What you can and cannot do

The CLI has **read-write access**. You can look up and update issues.

**Do:**

- Move an issue to In Progress when you start working on it:
  `linear issue update PRO-NNN --state "In Progress"`
- Add comments to issues when you have useful context to record — prefixed
  with your agent identity header (see "Identify yourself in comments and
  tickets" below)
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

## Identify yourself in comments and tickets

Agents write to Linear through a human's API credentials — the account that owns
the Linear workspace — so every comment and ticket an agent creates is
attributed to that person, indistinguishable from their own writing or from
another agent's. To keep a ticket's history legible, **you must prefix every
comment body and every ticket description you author with a bold header naming
the specific agent doing the writing**:

```
**Claude agent (senior-pm)**

…body…
```

The header is the first line, followed by a blank line, then the content. Name
the concrete agent — e.g. `handle-ticket`, `senior-pm`, `convention-review` —
not a generic "Claude agent", so a reader can tell which agent produced the
item. If you are an interactive Claude Code session with no specific agent
identity, use `**Claude agent**` on its own.

This obligation applies to anything an agent authors in Linear — whether it's a
predefined workflow step or an ad-hoc/requested write — and whichever tool you
use:

- **Comments** — `linear issue comment add --body-file …` (the `--body-file`
  form is preferred for markdown), or the Linear MCP's comment tool (available
  to the senior-pm agent). Any agent may add a comment whenever it has useful
  context to record — this is a normal, welcome thing to do, not a restricted
  action. It's usually an ad-hoc judgment call rather than a fixed workflow
  step; the header is required whenever you comment.
- **Ticket descriptions** you create or substantially rewrite — `linear issue
create`/`update --description-file …`, or the corresponding MCP tools.

The header is **not** for fields where it doesn't belong — titles, labels, and
state changes carry no header.

## Post a summary comment when you finish

The section above governs _how_ you write in Linear; this one makes one such
write an _obligation_. **On finishing a ticket, you must post a concise summary
of your work and findings as a comment on that ticket** — agent-header prefixed,
mirroring the end-of-work summary you report in-session. Without it, a ticket's
narrative lives only in the session transcript and (for code) the PR; for
fire-and-forget runs that means the ticket itself records nothing about what was
investigated or decided. The comment makes the ticket self-documenting and
durable, and is where a cross-ticket finding will actually be seen by a human.

**When this obligation fires:**

- **Ticket completion** — you finished the work the ticket called for (e.g. the
  PR is up and reviewed). This is the primary trigger.
- **A meaningful research or spike deliverable** — you reached a result worth
  recording, even if no code shipped.

**What the summary should contain** — e.g.:

- _What changed_ — a short description of the work, linked to the PR where one
  exists.
- _Key decisions and findings_ — what you decided and why, and anything you
  discovered that bears on the work.
- _Spillover_ — anything that affects or belongs to another ticket (name the
  `PRO-NNN`), so it surfaces where a human will see it rather than only in the
  transcript. The `--color-accent` token collision surfaced during PRO-292 is
  the kind of cross-ticket finding this is meant to capture.

These are illustrative, not a fixed template — include what a reader would need
to understand the run without replaying the transcript, and no more.

**When to skip:** trivial mechanical changes (a typo fix, a one-line config
bump) don't warrant a summary comment — use judgment. When genuinely in doubt,
post one; a short summary is cheap and the ticket history is the durable record.

Post it with the same mechanism and agent-header as above — preferably
`linear issue comment add PRO-NNN --body-file …` for markdown bodies.

## Branch naming

For ticket work the launcher (`scripts/agents/ticket`) resolves and truncates the
branch name and creates the worktree for you, so you normally don't apply this
rule by hand. It's documented here for ad-hoc worktree creation and as the rule
the launcher implements.

When creating a branch or worktree for a Linear issue, **start from the branch name Linear suggests**, then truncate if needed:

```bash
linear issue view PRO-NNN --json | jq -r .branchName
```

Linear's branch names include the issue ID (e.g. `feature/pro-136-give-agents-instructions-on-where-to-put-worktrees`), which is what triggers the GitHub integration that moves issues through their workflow.

**If the branch name exceeds 50 characters**, truncate the slug portion at a word boundary so the whole branch name is ≤50 characters, dropping whole trailing words (never cutting mid-word). Keep the `<type>/pro-NNN-` prefix intact — that's what Linear needs for linking. Example:

- Full: `feature/pro-136-give-agents-instructions-on-where-to-put-worktrees`
- Truncated: `feature/pro-136-give-agents-instructions`

For ad-hoc worktree creation, pass the result as the branch name to
`EnterWorktree` (with path `.claude/worktrees/<branch-name>`); do not use
`git worktree add` separately — `EnterWorktree` handles both creation and entry.

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

**Labels are not included in `linear issue view --json`.** To fetch labels,
use the GraphQL API:

```bash
linear api '{ issue(id: "PRO-NNN") { labels { nodes { name } } } }' \
  | jq -r '.data.issue.labels.nodes[].name'
```

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
or related but doesn't complete the issue.

Default to `fixes`. Use `refs` only when you know more work remains on the
ticket after this merge — e.g. this is one of several PRs for the ticket, or
it addresses only part of the described scope. If you're unsure whether the
work fully resolves the ticket, ask the user rather than guessing: a wrong
`fixes` auto-closes the issue on merge and is harder to undo than a wrong
`refs`.
