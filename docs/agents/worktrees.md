# Worktree Claude config

## Where worktrees live

Worktrees are created under **`.claude/worktrees/`** at the project root — the
directory the `EnterWorktree` tool manages. A **`.worktrees` → `.claude/worktrees`
symlink** is kept as an alias so external tooling (editors, scripts) that expects
the old `.worktrees/` path keeps working. The `enforce-worktree-path.sh` hook also
accepts a legacy `.worktrees/<name>` path and normalizes it to the canonical
location.

**Why not `.worktrees/` directly?** The tool enforces that *managed* worktrees
live under `.claude/worktrees/`. From the main checkout it will enter any path in
`git worktree list`, but **switching from inside one worktree into another** (the
nesting scenario) is rejected unless the target is a real directory under
`.claude/worktrees/`. The tool also explicitly refuses a `.claude/worktrees`
*symlink* ("the managed worktrees directory must not be a symlink"), so the
inverse — real `.worktrees/` aliased by a `.claude/worktrees` symlink — is
impossible. `.claude/worktrees/` as the real location is the only arrangement the
tool accepts in every mode. See PRO-247.

The hook anchors placement to the **main repo root** (via `git rev-parse
--git-common-dir`), so a worktree is never nested inside another even when the
current directory is already inside a worktree.

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

If you find an expected skill, hook, agent file, or local-settings symlink
absent while working in a worktree — e.g. a `/`-command or agent that exists in
the main repo isn't found — the setup hook likely didn't run. **This is the one
sanctioned exception to the "do not recreate" rule above:** re-run the hook
manually (do not hand-recreate the files):

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
(worktrees go in `.claude/worktrees/`, aliased by a `.worktrees` symlink).
