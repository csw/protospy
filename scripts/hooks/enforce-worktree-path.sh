#!/usr/bin/env bash
# PreToolUse hook for EnterWorktree: ensures worktrees live under
# .claude/worktrees/ at the MAIN repo root AND that the worktree actually
# exists on disk before the tool tries to enter it.
#
# Why .claude/worktrees/ (not .worktrees/)?  The EnterWorktree tool enforces
# that *managed* worktrees live under .claude/worktrees/. From the main checkout
# it will enter any path that appears in `git worktree list`, but *switching*
# from inside one worktree into another (the nesting scenario) is rejected
# unless the target is a real directory under .claude/worktrees/. A plain
# .worktrees/ convention therefore breaks worktree->worktree switches, and the
# tool explicitly refuses a `.claude/worktrees` symlink ("the managed worktrees
# directory must not be a symlink"). So .claude/worktrees/ is the real location;
# a `.worktrees -> .claude/worktrees` symlink is provided for external tooling
# (e.g. editors) that expects the old path. See PRO-247.
#
# The tool's `path` parameter only *enters an existing* worktree; it never
# creates one. So whether the agent calls EnterWorktree with `name` or `path`,
# this hook creates the worktree first — anchored to the MAIN repo root (never
# the current worktree) so a worktree is never nested inside another even when
# CWD is already inside a worktree.
#
#   EnterWorktree(name: "foo")                   -> creates .claude/worktrees/foo,
#                                                   rewrites input to that path.
#   EnterWorktree(path: ".claude/worktrees/foo") -> creates if missing, enters.
#   EnterWorktree(path: ".worktrees/foo")        -> accepted (legacy alias),
#                                                   normalized to .claude/worktrees/foo.
#   EnterWorktree(path: <elsewhere>)             -> blocked.
#
# Names containing slashes (e.g. "feature/pro-123-title") are flattened by
# replacing "/" with "-" so the worktree always lands at a single level. The
# branch is named after the worktree directory (the Linear issue slug, which
# embeds the pro-NNN identifier) so Linear's GitHub integration links the PR to
# the ticket.

set -euo pipefail

# ── Resolve the MAIN repo root, independent of CWD ──────────────────────────
# --git-common-dir always points at the main repo's .git regardless of which
# linked worktree we are in. Used both to re-exec the canonical hook copy and
# to anchor worktree placement.
common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) \
  || common_dir=$(git rev-parse --git-common-dir 2>/dev/null) || common_dir=""
case "$common_dir" in
  "") main_root="" ;;
  /*) main_root=$(dirname "$common_dir") ;;
  *)  main_root=$(dirname "$(pwd)/$common_dir") ;;
esac

# ── Always run the main repo's copy of this hook ────────────────────────────
# The hook is registered with a CWD-relative command, so inside a worktree the
# relative path resolves to *that worktree's* checked-out (possibly stale) copy.
# Re-exec the canonical main-repo copy so behaviour is identical everywhere.
# This runs before stdin is consumed, so the re-exec'd process reads the input.
if [[ -n "$main_root" ]]; then
  canonical="$main_root/scripts/hooks/enforce-worktree-path.sh"
  if [[ -f "$canonical" ]] \
     && [[ "$(realpath "$0" 2>/dev/null)" != "$(realpath "$canonical" 2>/dev/null)" ]]; then
    exec bash "$canonical"
  fi
fi

input=$(cat)

tool_name=$(echo "$input" | jq -r '.tool_name // empty')
if [[ "$tool_name" != "EnterWorktree" ]]; then
  exit 0
fi

# main_root must be known to place the worktree; if git couldn't resolve it,
# fall back to the current directory so we degrade rather than crash.
[[ -n "$main_root" ]] || main_root=$(pwd)
wt_dir="$main_root/.claude/worktrees"

# Provide the legacy `.worktrees -> .claude/worktrees` alias for external tools,
# but never clobber a populated real directory: pre-existing .worktrees/
# worktrees drain in place, and the symlink is created on machines where nothing
# is there yet (e.g. fresh clones).
ensure_alias() {
  local alias="$main_root/.worktrees"
  [[ -e "$alias" || -L "$alias" ]] && return 0
  ln -s .claude/worktrees "$alias" 2>/dev/null || true
}

# Create the worktree dir at $1 if absent, on a branch named after it. git
# stdout is suppressed (only the JSON below may reach stdout); stderr is left
# intact so real failures surface instead of degrading into an opaque ENOENT.
create_if_missing() {
  local worktree_path="$1"
  [[ -d "$worktree_path" ]] && return 0

  local branch
  branch=$(basename "$worktree_path")

  mkdir -p "$wt_dir"

  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    # Branch already exists (e.g. the worktree was removed but the branch kept)
    # — attach the existing branch instead of trying to recreate it.
    git worktree add "$worktree_path" "${branch}" >/dev/null
  else
    local default_branch
    default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null \
      | sed 's|refs/remotes/origin/||' || echo "main")
    git worktree add "$worktree_path" -b "${branch}" \
      "origin/${default_branch}" >/dev/null
  fi
}

deny() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
}

# Rewrite the tool input to an absolute .claude/worktrees/ path so the tool
# enters exactly the worktree we placed, regardless of CWD.
rewrite_to() {
  jq -n --arg p "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      updatedInput: { path: $p }
    }
  }'
}

ensure_alias

has_name=$(echo "$input" | jq -r '.tool_input.name // empty')
has_path=$(echo "$input" | jq -r '.tool_input.path // empty')

# Case 1: agent used path. Accept paths under .claude/worktrees/ (canonical) or
# .worktrees/ (legacy alias); normalize both to the canonical location. The
# patterns require a real directory boundary before .claude/worktrees/ so a
# malformed path like "foo.claude/worktrees/x" is not mistaken for canonical.
if [[ -n "$has_path" ]]; then
  case "$has_path" in
    .claude/worktrees/*)   name="${has_path#.claude/worktrees/}" ;;
    */.claude/worktrees/*) name="${has_path##*/.claude/worktrees/}" ;;
    .worktrees/*)          name="${has_path#.worktrees/}" ;;
    */.worktrees/*)        name="${has_path##*/.worktrees/}" ;;
    *)
      deny "Project policy: worktrees must live under .claude/worktrees/ at the repo root (a legacy .worktrees/ path is also accepted). Use path: \".claude/worktrees/<name>\" or pass name instead of path."
      exit 0
      ;;
  esac
  # The name must be a single flat segment under the worktrees dir. Reject extra
  # path segments rather than silently truncating to a different worktree than
  # was requested (a trailing slash is tolerated and stripped).
  name="${name%/}"
  if [[ -z "$name" || "$name" == */* ]]; then
    deny "Project policy: worktree path must be a single flat name under .claude/worktrees/ (got: \"$has_path\"). Pass path: \".claude/worktrees/<name>\" with no extra segments, or pass name instead."
    exit 0
  fi
  worktree_path="$wt_dir/$name"
  create_if_missing "$worktree_path"
  rewrite_to "$worktree_path"
  exit 0
fi

# Case 2: agent used name (or neither — tool would generate a random name).
# Flatten slashes so the worktree lands at a single level under .claude/worktrees/.
name="${has_name}"
if [[ -z "$name" ]]; then
  name="wt-$(date +%s)"
fi
safe_name="${name//\//-}"
worktree_path="$wt_dir/$safe_name"
create_if_missing "$worktree_path"
rewrite_to "$worktree_path"
