#!/usr/bin/env bash
# Symlinks non-version-controlled Claude config from the main repo root into
# a newly-created worktree. This ensures agents working in worktrees have
# access to skills, hooks, settings, and local overrides — without
# duplicating files that are maintained in one place.
#
# Invoked by the post-checkout git hook (via pre-commit framework).
# Git passes: $1=prev-HEAD  $2=new-HEAD  $3=checkout-type (1=branch, 0=file)
#
# Idempotent: safe to run multiple times. Existing correct symlinks are kept;
# real files (version-controlled content) are never overwritten.
set -euo pipefail

# Detect worktree: git-common-dir differs from git-dir
git_dir="$(git rev-parse --git-dir)"
git_common_dir="$(git rev-parse --git-common-dir)"

# Resolve to absolute, canonical paths for reliable comparison
git_dir_abs="$(cd "$git_dir" && pwd -P)"
git_common_dir_abs="$(cd "$git_common_dir" && pwd -P)"

# In the main repo, git-dir == git-common-dir — nothing to do
[[ "$git_dir_abs" != "$git_common_dir_abs" ]] || exit 0

# Derive main repo root: parent of the common .git/ directory
main_root="$(cd "$git_common_dir_abs/.." && pwd -P)"
worktree_root="$(git rev-parse --show-toplevel)"

echo "Worktree detected: symlinking Claude config from $main_root" >&2

# symlink_item <src> <dst>
# Creates a symlink dst -> src. Skips if dst already points to src (idempotent).
# Replaces a wrong-target symlink. Skips real files/dirs (version-controlled content).
symlink_item() {
    local src="$1"
    local dst="$2"
    local label="${dst#$worktree_root/}"

    # Source must exist in the main repo
    [[ -e "$src" ]] || return 0

    # Already a correct symlink — idempotent, skip
    if [[ -L "$dst" ]]; then
        local existing
        existing="$(readlink "$dst")"
        if [[ "$existing" == "$src" ]]; then
            return 0
        fi
        # Wrong target (e.g. stale relative path): remove and recreate
        rm "$dst"
    fi

    # Real file or directory exists (version-controlled) — leave it alone
    if [[ -e "$dst" ]]; then
        echo "  skip  $label (real file exists — not overwriting)" >&2
        return 0
    fi

    ln -s "$src" "$dst"
    echo "  linked $label → $src" >&2
}

# symlink_dir_contents <src_dir> <dst_dir>
# For directories that exist in the worktree (because they contain version-controlled
# files), symlink individual entries from src_dir that aren't already present in dst_dir.
symlink_dir_contents() {
    local src_dir="$1"
    local dst_dir="$2"
    [[ -d "$src_dir" ]] || return 0
    mkdir -p "$dst_dir"
    for src in "$src_dir"/*; do
        [[ -e "$src" ]] || continue  # glob miss
        local name
        name="$(basename "$src")"
        symlink_item "$src" "$dst_dir/$name"
    done
}

worktree_claude="$worktree_root/.claude"
main_claude="$main_root/.claude"

# skills/ — completely gitignored; symlink the whole directory
symlink_item "$main_claude/skills" "$worktree_claude/skills"

# hooks/ — all hook scripts are version-controlled, so the directory already
# exists in the worktree. Symlink any non-tracked files (e.g. future additions).
symlink_dir_contents "$main_claude/hooks" "$worktree_claude/hooks"

# agents/ — directory exists with tracked files; symlink individual non-tracked
# files (e.g. senior-pm.md which is gitignored in the main repo)
symlink_dir_contents "$main_claude/agents" "$worktree_claude/agents"

# settings.local.json — gitignored; symlink the file
symlink_item "$main_claude/settings.local.json" "$worktree_claude/settings.local.json"

# CLAUDE.local.md at the root and in all subdirectories.
# Found dynamically so new subdirs with local overrides are picked up
# automatically. Excludes .git/ and the worktree storage dirs to avoid
# recursing into other worktrees or git internals. Worktrees now live under
# .claude/worktrees/ (with .worktrees as a legacy symlink alias); both are
# excluded. find does not follow the .worktrees symlink, so excluding the real
# .claude/worktrees/ path is what actually prevents descending into siblings.
while IFS= read -r -d '' src; do
    rel="${src#$main_root/}"
    dst="$worktree_root/$rel"
    mkdir -p "$(dirname "$dst")"
    symlink_item "$src" "$dst"
done < <(find "$main_root" -name "CLAUDE.local.md" \
    -not -path "$main_root/.git/*" \
    -not -path "$main_root/.worktrees/*" \
    -not -path "$main_root/.claude/worktrees/*" \
    -print0)

echo "Claude config setup complete." >&2

# tailwind-4-docs snapshot — initialize once per worktree; ~5 MB, ~10 s.
# Skips if already initialized today or if the skill isn't present.
tailwind_skill="$worktree_root/.agents/skills/tailwind-4-docs"
tailwind_sync="$tailwind_skill/scripts/sync_tailwind_docs.py"
tailwind_src="$tailwind_skill/references/docs-source.txt"

if [[ -f "$tailwind_sync" ]]; then
    today="$(date +%Y-%m-%d)"
    current_date=""
    if [[ -f "$tailwind_src" ]]; then
        current_date="$(grep '^Snapshot-Date:' "$tailwind_src" | awk '{print $2}')"
    fi
    if [[ "$current_date" == "$today" ]]; then
        echo "tailwind-4-docs snapshot is current ($today), skipping." >&2
    else
        echo "Initializing tailwind-4-docs snapshot..." >&2
        if python "$tailwind_sync" --accept-docs-license 2>&1; then
            echo "tailwind-4-docs snapshot initialized." >&2
        else
            echo "Warning: tailwind-4-docs snapshot failed (no network?); skill will fall back to gotchas.md." >&2
        fi
    fi
fi
