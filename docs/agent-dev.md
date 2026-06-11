# Agent Development

This repository keeps the ticket workflow in one shared `handle-ticket` skill so
Claude Code and Codex follow the same implementation, verification, review, and
close-out sequence. A single launcher, `scripts/agents/ticket`, creates the
worktree and starts the chosen harness CLI inside it, so the session begins with
its cwd already in the worktree.

## Handle Ticket

Use `handle-ticket` for Linear implementation tickets in the `PRO-NNN` form.
Start it from a normal shell via the launcher — never invoke the skill directly
from the main checkout. The launcher resolves the ticket branch from Linear,
creates or reuses the worktree on that branch, installs UI deps, then starts the
harness CLI in the worktree running `handle-ticket`. The skill assumes it is
already in the right worktree (it keeps a cheap `git rev-parse` check as a safety
net) and never creates worktrees or switches branches.

### Claude Code

```bash
just claude-ticket PRO-123 [instructions]
# or, in the cs container:
cs claude-ticket PRO-123 [instructions]
```

The launcher creates `.worktrees/<branch-slug>` on the ticket branch (the
`.claude/worktrees/<branch>` location, aliased by `.worktrees`), `chdir`s into
it, and execs `claude` there with `/handle-ticket PRO-123 …` as the initial
prompt. Claude Code has no `-C` flag, so starting it from inside the worktree is
what makes the session cwd the worktree from turn one.

### Codex

```bash
just codex-ticket PRO-123 [instructions]
# or, in the cs container:
cs codex-ticket PRO-123 [instructions]
```

The launcher creates the same worktree and starts `codex -C <worktree>` with
`$handle-ticket PRO-123 …` as the prompt.

### Shared workflow source

The `handle-ticket` skill is generated for both harnesses from one Jinja2
template, `.claude/skills/handle-ticket/SKILL.md.j2`. For any workflow change,
edit the template and run `scripts/agents/sync-handle-ticket-skill`; pre-commit
checks that both generated `SKILL.md` files stay in sync. Do not edit the
generated skills directly. Harness-specific launch behavior lives in
`scripts/agents/ticket`, not in the skill.

### Launcher options

```bash
just claude-ticket PRO-123 -v 2
just codex-ticket PRO-123 --version 2
just codex-ticket PRO-123 --branch codex/pro-123-manual-alt
just claude-ticket PRO-123 --worktree .worktrees/pro-123-manual-alt
```

When `-v/--version`, `--branch`, or `--worktree` is used, that selected
branch/worktree is authoritative for the run. The ticket workflow must not fall
back to another branch or continue a PR from another branch unless the operator
explicitly asks for that. If the operator says to start fresh, that means ignore
prior branches and PRs for the ticket and proceed independently on the selected
branch/worktree. Do not inspect or use other ticket-linked branches or PRs
unless the operator explicitly names that branch or PR.

Everything after the ticket that is not a launcher option is passed to
`handle-ticket` as run-specific instructions. Use `-i/--instructions` for longer
or shell-sensitive instruction text. `--model` works for both harnesses;
`--effort` is Codex-only; raw harness flags can be passed via `--harness-arg` or
after `--`.
