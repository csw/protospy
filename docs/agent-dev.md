# Agent Development

This repository keeps the ticket workflow in shared skills so Claude Code and
Codex follow the same implementation, verification, review, and close-out
sequence while using their own worktree setup.

## Handle Ticket

Use `handle-ticket` for Linear implementation tickets in the `PRO-NNN` form.
Do not invoke `handle-ticket-inner` directly from the main checkout; it is the
inner execution flow that starts only after the public entry point has placed
the run in the right worktree.

### Claude Code

In Claude Code, start the workflow with:

```text
/handle-ticket PRO-123 [instructions]
```

Examples:

```text
/handle-ticket PRO-123
/handle-ticket PRO-123 skip the visual review
```

The Claude skill reads Linear, chooses the Linear branch name, enters the
project-managed `.claude/worktrees/<branch-name>` worktree, then continues with
`handle-ticket-inner` in the same Claude thread.

### Codex

In Codex, start the workflow from a normal shell in the repository root:

```bash
just codex-ticket PRO-123 [instructions]
```

Examples:

```bash
just codex-ticket PRO-123
just codex-ticket PRO-123 skip the visual review
just codex-ticket PRO-123 -i "skip the visual review"
```

The `just` recipe invokes `scripts/agents/codex-ticket`. That wrapper reads
Linear, creates or reuses `.worktrees/<branch-slug>` on the ticket branch, then
starts Codex in that worktree with `handle-ticket-inner`.

The Codex `handle-ticket-inner` skill is generated from the Claude skill source
with Codex-specific worktree/branch substitutions. For shared workflow changes,
edit `.claude/skills/handle-ticket-inner/SKILL.md` and run
`scripts/agents/sync-handle-ticket-inner-skill`; do not edit
`.agents/skills/handle-ticket-inner/SKILL.md` directly.

For alternative Codex branches or explicit worktree resumption, use the wrapper
options:

```bash
just codex-ticket PRO-123 -v 2
just codex-ticket PRO-123 --version 2
just codex-ticket PRO-123 --branch codex/pro-123-manual-alt
just codex-ticket PRO-123 --worktree .worktrees/pro-123-manual-alt
```

When `-v/--version`, `--branch`, or `--worktree` is used, that selected
branch/worktree is authoritative for the run. The inner ticket workflow must not
fall back to another branch or continue a PR from another branch unless the
operator explicitly asks for that.
If the operator says to start fresh, that means ignore prior branches and PRs
for the ticket and proceed independently on the selected branch/worktree. Do not
inspect or use other ticket-linked branches or PRs unless the operator
explicitly names that branch or PR.

Everything after the ticket that is not a wrapper option is passed to
`handle-ticket-inner` as run-specific instructions. Use `-i/--instructions` for
longer or shell-sensitive instruction text.
