#!/usr/bin/env bash
# PreToolUse hook for EnterWorktree: rewrites name-based calls to use
# .worktrees/ instead of the tool's default .claude/worktrees/.
#
# If the agent calls EnterWorktree(name: "foo"), this hook:
#   1. Creates the worktree at .worktrees/foo via git
#   2. Rewrites the tool input to path-based entry
#
# If the agent already uses path: ".worktrees/...", passes through.
# If the agent uses path pointing elsewhere, blocks.

set -euo pipefail

input=$(cat)

tool_name=$(echo "$input" | jq -r '.tool_name // empty')
if [[ "$tool_name" != "EnterWorktree" ]]; then
  exit 0
fi

has_name=$(echo "$input" | jq -r '.tool_input.name // empty')
has_path=$(echo "$input" | jq -r '.tool_input.path // empty')

# Case 1: agent used path — validate it points to .worktrees/
if [[ -n "$has_path" ]]; then
  # Normalize: strip trailing slash, resolve relative
  if [[ "$has_path" == .worktrees/* ]] || [[ "$has_path" == */.worktrees/* ]]; then
    # Good path, pass through
    exit 0
  else
    # Bad path — block
    jq -n '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Project policy: worktrees must be under .worktrees/ at the project root. Use path: \".worktrees/<name>\" or let the hook rewrite by using name instead of path."
      }
    }'
    exit 0
  fi
fi

# Case 2: agent used name (or neither — tool generates a random name)
# Create the worktree ourselves in .worktrees/, then rewrite to path-based entry.
name="${has_name}"
if [[ -z "$name" ]]; then
  # No name provided; generate one so we can control placement
  name="wt-$(date +%s)"
fi

worktree_path=".worktrees/${name}"

# Only create if it doesn't already exist
if [[ ! -d "$worktree_path" ]]; then
  mkdir -p .worktrees
  # Determine default branch
  default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||' || echo "main")
  git worktree add "$worktree_path" -b "worktree-${name}" "origin/${default_branch}" 2>&1 >/dev/null
fi

# Rewrite the tool input: swap name for path
jq -n --arg p "$worktree_path" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    updatedInput: { path: $p }
  }
}'
