#!/usr/bin/env bash
# Test suite for enforce-worktree-path.sh hook.
# Run from the repo root: bash scripts/hooks/test-enforce-worktree-path.sh
#
# Tests are run inside a temporary git repo that mirrors the structure the
# hook expects. Each test pipes a JSON payload into the hook and asserts on
# the JSON output.

set -euo pipefail

HOOK="scripts/hooks/enforce-worktree-path.sh"
PASS=0
FAIL=0
FAILURES=()

# ── helpers ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; PASS=$((PASS+1)); }
fail() {
  echo -e "${RED}FAIL${NC} $1"
  FAILURES+=("$1")
  FAIL=$((FAIL+1))
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label"
  else
    fail "$label — expected: $(echo "$expected" | head -3), got: $(echo "$actual" | head -3)"
  fi
}

assert_jq() {
  local label="$1" filter="$2" expected="$3" json="$4"
  local actual
  actual=$(echo "$json" | jq -r "$filter" 2>/dev/null || echo "<jq-error>")
  assert_eq "$label" "$expected" "$actual"
}

run_hook() {
  local input="$1"
  echo "$input" | bash "$REPO_DIR/$HOOK" 2>/dev/null || true
}

# ── setup: temporary git repo ─────────────────────────────────────────────

TMPDIR=$(mktemp -d)
REPO_DIR="$TMPDIR/repo"
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$REPO_DIR"

# Bare "remote" repo (origin)
ORIGIN_DIR="$TMPDIR/origin.git"
git init -q --bare "$ORIGIN_DIR"
# Seed origin with a commit on main
SEED_DIR="$TMPDIR/seed"
git init -q "$SEED_DIR"
git -C "$SEED_DIR" commit --allow-empty -q -m "init"
git -C "$SEED_DIR" remote add origin "$ORIGIN_DIR"
git -C "$SEED_DIR" push -q origin HEAD:main
rm -rf "$SEED_DIR"

# Working repo
git clone -q "$ORIGIN_DIR" "$REPO_DIR"
cd "$REPO_DIR"

# Copy hook into the temp repo tree
mkdir -p scripts/hooks
cp "$OLDPWD/$HOOK" scripts/hooks/enforce-worktree-path.sh
mkdir -p .worktrees

# ── test cases ────────────────────────────────────────────────────────────────

# 1. Non-EnterWorktree tool → pass through (no output)
OUT=$(run_hook '{"tool_name":"Bash","tool_input":{"command":"ls"}}')
assert_eq "non-EnterWorktree exits silently" "" "$OUT"

# 2. Path already under .worktrees/ → pass through (no output / exit 0)
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{"path":".worktrees/my-branch"}}')
assert_eq "good path passes through silently" "" "$OUT"

# 3. Path under nested .worktrees/ → pass through
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{"path":"/abs/path/.worktrees/foo"}}')
assert_eq "absolute path with .worktrees/ passes through" "" "$OUT"

# 4. Path NOT under .worktrees/ → deny
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{"path":".claude/worktrees/foo"}}')
assert_jq "bad path → deny decision" \
  '.hookSpecificOutput.permissionDecision' "deny" "$OUT"

# 5. Name without slashes → creates worktree, rewrites to path
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{"name":"my-feature"}}')
assert_jq "simple name → updatedInput present" \
  '.hookSpecificOutput.updatedInput.path' ".worktrees/my-feature" "$OUT"
assert_jq "simple name → updatedInput has no name key" \
  '.hookSpecificOutput.updatedInput | has("name")' "false" "$OUT"
[[ -d ".worktrees/my-feature" ]] && pass "simple name → worktree dir created" \
  || fail "simple name → worktree dir NOT created"

# 6. Name WITH slashes (the bug): should sanitize, not silently fail
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{"name":"feature/pro-189-fix-test-regressions"}}')
REWRITTEN_PATH=$(echo "$OUT" | jq -r '.hookSpecificOutput.updatedInput.path' 2>/dev/null || echo "")
assert_jq "slashed name → updatedInput present (not empty)" \
  '.hookSpecificOutput | has("updatedInput")' "true" "$OUT"
# Path must not contain slashes below .worktrees/
SUFFIX="${REWRITTEN_PATH#.worktrees/}"
if [[ -n "$SUFFIX" ]] && [[ "$SUFFIX" != */* ]]; then
  pass "slashed name → flat path (no sub-slashes)"
else
  fail "slashed name → path not flat: '$REWRITTEN_PATH'"
fi
if [[ -n "$REWRITTEN_PATH" ]] && [[ -d "$REWRITTEN_PATH" ]]; then
  pass "slashed name → worktree dir created"
else
  fail "slashed name → worktree dir NOT created (path='$REWRITTEN_PATH')"
fi

# 7. Empty name → generates timestamped fallback, rewrites to path
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{}}')
assert_jq "empty name → updatedInput present" \
  '.hookSpecificOutput | has("updatedInput")' "true" "$OUT"
GEN_PATH=$(echo "$OUT" | jq -r '.hookSpecificOutput.updatedInput.path' 2>/dev/null || echo "")
if [[ "$GEN_PATH" == .worktrees/wt-* ]]; then
  pass "empty name → generated path under .worktrees/"
else
  fail "empty name → unexpected path: '$GEN_PATH'"
fi

# ── summary ──────────────────────────────────────────────────────────────────

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo "Failed tests:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
