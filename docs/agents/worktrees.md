# Worktrees

## Step 0: isolation detection — run commands individually

When the `using-git-worktrees` skill runs Step 0 isolation detection, execute each git command as a **separate Bash call** — not combined into a single compound shell expression.

**This overrides the skill's own Step 0 code example**, which uses a combined form that cannot be statically analyzed and triggers an unnecessary approval prompt.

Run these individually:

```bash
git rev-parse --git-dir
git rev-parse --git-common-dir
git branch --show-current
git rev-parse --show-superproject-working-tree 2>/dev/null
```

Do **not** combine them into a single expression such as:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P) && ...
```

The individual commands are pre-approved and run without confirmation.

## Running git commands in a worktree

When working inside a worktree (i.e., the session is already in the worktree directory), run git commands **directly** — no `cd` prefix needed:

```bash
git add path/to/file
git commit -m "..."
```

**Never** prepend `cd /path/to/worktree &&` to a git command. This triggers the "changes directory before running git (untrusted hooks)" approval prompt even when the target directory is the current working directory. The compound `cd` form is unnecessary once you are in the worktree.

If you need to run a git command against a worktree from outside it, use `git -C` instead of `cd`:

```bash
# Good
git -C /Users/csw/src/protospy/.worktrees/my-worktree status

# Bad — triggers approval prompt
cd /Users/csw/src/protospy/.worktrees/my-worktree && git status
```
