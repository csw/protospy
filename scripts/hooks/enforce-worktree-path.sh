#!/usr/bin/env bash
# PreToolUse hook for EnterWorktree: ensures worktrees live under .worktrees/
# at the project root (not the tool's default .claude/worktrees/) AND that the
# worktree actually exists on disk before the tool tries to enter it.
#
# The EnterWorktree tool's `path` parameter only *enters an existing* worktree
# (it requires the path to already appear in `git worktree list`); it never
# creates one. So whether the agent calls EnterWorktree with `name` or `path`,
# this hook is responsible for creating the worktree first.
#
#   EnterWorktree(name: "foo")            -> creates .worktrees/foo, rewrites
#                                            the tool input to path-based entry.
#   EnterWorktree(path: ".worktrees/foo") -> creates .worktrees/foo if missing,
#                                            then passes through to enter it.
#   EnterWorktree(path: <elsewhere>)      -> blocked (must be under .worktrees/).
#
# Names containing slashes (e.g. "feature/pro-123-title") are flattened by
# replacing "/" with "-" so the worktree always lands at a single level under
# .worktrees/ (e.g. .worktrees/feature-pro-123-title).
#
# The branch is named after the worktree directory (which is the truncated
# Linear branchName) so Linear's GitHub integration links the PR to the ticket.

set -euo pipefail

input=$(cat)

tool_name=$(echo "$input" | jq -r '.tool_name // empty')
if [[ "$tool_name" != "EnterWorktree" ]]; then
  exit 0
fi

# Create the worktree at $1 if it doesn't already exist, on a branch named
# after the worktree directory. git stdout is suppressed (only the JSON emitted
# below may reach stdout) but stderr is left intact so real failures surface to
# the user instead of degrading into a confusing ENOENT from the tool.
ensure_worktree() {
  local worktree_path="$1"
  [[ -d "$worktree_path" ]] && return 0

  local branch
  branch=$(basename "$worktree_path")

  mkdir -p .worktrees

  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    # Branch already exists (e.g. the worktree was removed but the branch was
    # kept) — attach the existing branch instead of trying to recreate it.
    git worktree add "$worktree_path" "${branch}" >/dev/null
  else
    # Determine default branch; fall back to "main" if origin/HEAD isn't set.
    local default_branch
    default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null \
      | sed 's|refs/remotes/origin/||' || echo "main")
    git worktree add "$worktree_path" -b "${branch}" \
      "origin/${default_branch}" >/dev/null
  fi
}

has_name=$(echo "$input" | jq -r '.tool_input.name // empty')
has_path=$(echo "$input" | jq -r '.tool_input.path // empty')

# Case 1: agent used path — validate it points under .worktrees/, then ensure
# it exists so the tool can enter it.
if [[ -n "$has_path" ]]; then
  if [[ "$has_path" == .worktrees/* ]] || [[ "$has_path" == */.worktrees/* ]]; then
    ensure_worktree "$has_path"
    exit 0
  fi
  # Bad path — block.
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Project policy: worktrees must be under .worktrees/ at the project root. Use path: \".worktrees/<name>\" or pass name instead of path."
    }
  }'
  exit 0
fi

# Case 2: agent used name (or neither — tool would generate a random name).
# Flatten slashes in name so the worktree is always one level under .worktrees/
# (git sanitizes "/" to "+" in branch names which produces unexpected paths).
name="${has_name}"
if [[ -z "$name" ]]; then
  # No name provided; generate one so we can control placement.
  name="wt-$(date +%s)"
fi

# Replace every "/" with "-" to keep the path flat.
safe_name="${name//\//-}"

worktree_path=".worktrees/${safe_name}"

ensure_worktree "$worktree_path"

# Rewrite the tool input: swap name for path so the tool enters the worktree
# the hook just placed under .worktrees/.
jq -n --arg p "$worktree_path" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    updatedInput: { path: $p }
  }
}'
