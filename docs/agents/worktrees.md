# Worktrees

When the `using-git-worktrees` skill runs Step 0 isolation detection, execute each git command as a **separate Bash call** — not combined into a single compound shell expression.

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

That form cannot be statically analyzed and triggers an unnecessary approval prompt. The individual commands are pre-approved and run without confirmation.
