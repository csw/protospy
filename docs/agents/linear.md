# Linear

This project uses Linear for issue tracking. The team key is `PRO`, so issue IDs take the form `PRO-NNN` (e.g. `PRO-50`). When the user references a ticket like `PRO-50`, it is a Linear issue identifier.

The `linear` CLI (`joa23/linear-cli`) is installed and authenticated; invoke it directly. The repo root holds a `.linear.yaml` (`team: PRO`), so the CLI auto-detects the team — you never need `--team PRO`. Default output is token-efficient text; pass `--output json` when you need to parse fields.

For full CLI documentation, invoke the `linear` skill.

## Actor identity (no agent-header needed)

The CLI authenticates as a distinct OAuth **actor identity**, not the maintainer's personal account, so every comment and ticket an agent writes is attributed to that agent identity in Linear's own UI. You do **not** need to prefix comments or descriptions with an agent-name header — the identity is carried by the credential. (Two identities exist — a PM identity and an implementer identity — selected by the sandbox mount; see `~/src/claude-sandbox/`. You don't switch them yourself.)

## What you can and cannot do

The CLI has **read-write access**. You can look up and update issues.

**Do:**

- Move an issue to In Progress when you start working on it:
  `linear issues update PRO-NNN --state "In Progress"`
- Add comments to issues when you have useful context to record.
- Look up issue details, status, and relationships.

**Don't:**

- Close issues or move them to Done. Let the GitHub integration handle
  that on PR merge (see "Linking work to issues" below).
- Create issues directly. Use `/pm:capture` with a short description —
  this routes through the PM agent for labeling, deduplication, and
  ticket shaping. Use it for separate discoveries (a bug you stumbled
  across, a missing test, a new issue) — not for scope questions about
  your current task, which should go to the user interactively.
- Change labels, priority, or project assignment without being asked.

## Post a summary comment when you finish

**On finishing a ticket, you must post a concise summary of your work and
findings as a comment on that ticket**, mirroring the end-of-work summary you
report in-session. Without it, a ticket's narrative lives only in the session
transcript and (for code) the PR; for fire-and-forget runs that means the ticket
itself records nothing about what was investigated or decided. The comment makes
the ticket self-documenting and durable, and is where a cross-ticket finding will
actually be seen by a human.

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

Post it with `linear issues comment`. For a markdown body, write the comment to a
file and pipe it in (`-b -` reads the body from stdin):

```bash
linear issues comment PRO-NNN -b - < summary.md
# or inline for short notes:
linear issues comment PRO-NNN -b "Short note."
```

## Branch naming

For ticket work the launcher (`scripts/agents/ticket`) resolves and truncates the
branch name and creates the worktree for you, so you normally don't apply this
rule by hand. It's documented here for ad-hoc worktree creation and as the rule
the launcher implements.

The branch name is `<type>/pro-NNN-<slug>`, where `<slug>` is the issue title
slugified (lowercase, non-alphanumerics collapsed to single dashes). The
`pro-NNN` segment is what triggers the GitHub integration that moves issues
through their workflow, so it must be present. Get the title with:

```bash
linear issues get PRO-NNN --output json | jq -r .title
```

**If the branch name exceeds 50 characters**, truncate the slug portion at a word boundary so the whole branch name is ≤50 characters, dropping whole trailing words (never cutting mid-word). Keep the `<type>/pro-NNN-` prefix intact — that's what Linear needs for linking. Example:

- Full: `feature/pro-136-give-agents-instructions-on-where-to-put-worktrees`
- Truncated: `feature/pro-136-give-agents-instructions`

For ad-hoc worktree creation, pass the result as the branch name to
`EnterWorktree` (with path `.claude/worktrees/<branch-name>`); do not use
`git worktree add` separately — `EnterWorktree` handles both creation and entry.

## Getting issue details

```bash
linear issues get PRO-NNN                              # token-efficient text (default)
linear issues get PRO-NNN --output json                # machine-readable (may truncate long fields)
linear issues get PRO-NNN --output json --format full  # complete — use when reading descriptions or comments
```

**Use `--format full` whenever you need the ticket description or comments.**
Without it, long descriptions and comments are truncated. Metadata-only queries
(state, assignee, labels, parent/children) are fine without it.

Useful fields and how to extract them with jq (from `--output json`):

```bash
# State (e.g. "Todo", "In Progress", "Done")
linear issues get PRO-NNN --output json | jq -r .state.name

# Assignee
linear issues get PRO-NNN --output json | jq -r .assignee.name

# Project
linear issues get PRO-NNN --output json | jq -r .project.name

# Labels (included natively — no separate query needed)
linear issues get PRO-NNN --output json | jq -r '.labels[].name'

# Parent issue identifier (null if top-level)
linear issues get PRO-NNN --output json | jq -r .parent.identifier

# Child issue identifiers (a bare array, not nested under .nodes)
linear issues get PRO-NNN --output json | jq -r '.children[].identifier'

# Priority (0=No priority, 1=Urgent, 2=High, 3=Normal, 4=Low)
linear issues get PRO-NNN --output json | jq .priority
```

Top-level fields present in the JSON: `identifier`, `title`, `description`, `url`, `state`, `assignee`, `creator`, `priority`, `estimate`, `dueDate`, `labels`, `project`, `cycle`, `parent`, `children`, `comments`, `attachments`, `createdAt`, `updatedAt`. The `--format` flag controls verbosity (`minimal|compact|detailed|full`); `detailed` is the default — `full` is needed for untruncated descriptions and comments.

### Semantic search

`linear search` is a **semantic** search — it finds related issues even without
exact keyword matches, and resolves the `PRO` team default from `.linear.yaml`:

```bash
linear search "oauth actor identity"          # related issues, ranked
linear search "body rendering" --type all      # issues, cycles, projects, users
linear search --has-blockers                    # all issues with blockers
```

### Images in a ticket

Images embedded in a description or comment (`uploads.linear.app/...`) require
auth to fetch. Download one to a local file, then read it:

```bash
linear attachments download "https://uploads.linear.app/..."
# → writes /tmp/linear-img-<hash>.png
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
