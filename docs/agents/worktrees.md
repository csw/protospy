# Worktree Claude config

## What gets symlinked

When a new worktree is created (via `git worktree add` or the `EnterWorktree` tool),
a `post-checkout` hook automatically symlinks non-version-controlled Claude config
from the main repo root into the worktree. This gives agents working in worktrees
access to the same skills, hooks, settings, and local overrides as the main checkout.

The following items are symlinked (if they exist in the main repo):

| Item | Destination |
|---|---|
| `.claude/skills/` | `.claude/skills/` in the worktree |
| `.claude/hooks/` | `.claude/hooks/` in the worktree |
| `.claude/agents/` | `.claude/agents/` in the worktree |
| `.claude/settings.local.json` | `.claude/settings.local.json` in the worktree |
| `CLAUDE.local.md` (root) | `CLAUDE.local.md` in the worktree |
| `*/CLAUDE.local.md` (subdirs) | mirrored path in the worktree |

`CLAUDE.local.md` files in subdirectories are discovered dynamically via `find`, so
new subdirectory overrides are picked up automatically without editing the hook.

The worktree's `.claude/settings.json` comes from the branch checkout (it's
version-controlled) and is **not** symlinked or overwritten.

## Why symlinks, not copies

All worktrees share the same main-repo files via symlinks, so:

- Changes to skills, hooks, or local settings in the main repo are immediately
  visible in all worktrees.
- There's one source of truth — no drift between worktree copies.

## Do not manually copy or recreate these files

Agents must **not** attempt to copy, recreate, or re-add any of the items listed
above inside a worktree. The symlinks are set up automatically by the hook, and
manual copies would break the single-source property and may diverge from the
main-repo versions.

If a symlink is missing in a worktree (e.g. the hook wasn't installed yet),
re-run the hook manually:

```bash
bash scripts/worktree-claude-setup.sh "" "" 1
```

Or delete the worktree and recreate it — the hook fires on `git worktree add`.

## Idempotency

The hook is safe to run multiple times. Correct symlinks are left unchanged; real
files (version-controlled content) are never overwritten.

## Hook installation

The hook runs via the pre-commit framework. It is installed with:

```bash
pre-commit install -t pre-commit -t commit-msg -t post-checkout
```

If the `post-checkout` stage was not included when you originally ran
`pre-commit install`, re-run the command above — it is safe to re-run.

See the Worktrees section of the root `CLAUDE.md` for the path convention
(`worktrees go in .worktrees/`).
