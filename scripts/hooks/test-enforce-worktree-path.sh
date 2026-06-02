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

assert_valid_json() {
  local label="$1" json="$2"
  if echo "$json" | jq . >/dev/null 2>&1; then
    pass "$label"
  else
    fail "$label — output is not valid JSON: $(echo "$json" | head -3)"
  fi
}

run_hook() {
  local input="$1"
  echo "$input" | bash "$REPO_DIR/$HOOK" 2>/dev/null || true
}

# ── setup: temporary git repo ─────────────────────────────────────────────

TEST_ROOT=$(mktemp -d)
REPO_DIR="$TEST_ROOT/repo"
trap 'rm -rf "$TEST_ROOT"' EXIT

mkdir -p "$REPO_DIR"

# Bare "remote" repo (origin)
ORIGIN_DIR="$TEST_ROOT/origin.git"
git init -q --bare "$ORIGIN_DIR"
# Seed origin with a commit on main
SEED_DIR="$TEST_ROOT/seed"
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

# Canonical (real) worktree location and legacy alias.
WT_DIR="$REPO_DIR/.claude/worktrees"

# ── test cases ────────────────────────────────────────────────────────────────

# 1. Non-EnterWorktree tool → pass through (no output)
OUT=$(run_hook '{"tool_name":"Bash","tool_input":{"command":"ls"}}')
assert_eq "non-EnterWorktree exits silently" "" "$OUT"

# 2. Canonical path under .claude/worktrees/ → rewrite to absolute path, create
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{"path":".claude/worktrees/my-branch"}}')
assert_valid_json "canonical path → valid JSON" "$OUT"
assert_jq "canonical path → rewritten to absolute .claude/worktrees path" \
  '.hookSpecificOutput.updatedInput.path' "$WT_DIR/my-branch" "$OUT"
[[ -d "$WT_DIR/my-branch" ]] && pass "canonical path → worktree dir created" \
  || fail "canonical path → worktree dir NOT created"

# 3. Legacy .worktrees/ path → normalized to .claude/worktrees/, create
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{"path":".worktrees/legacy-branch"}}')
assert_jq "legacy .worktrees path → normalized to .claude/worktrees" \
  '.hookSpecificOutput.updatedInput.path' "$WT_DIR/legacy-branch" "$OUT"
[[ -d "$WT_DIR/legacy-branch" ]] && pass "legacy path → worktree dir created under .claude/worktrees" \
  || fail "legacy path → worktree dir NOT created"

# 4. Path NOT under a recognized worktrees dir → deny
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{"path":"src/some/where"}}')
assert_jq "bad path → deny decision" \
  '.hookSpecificOutput.permissionDecision' "deny" "$OUT"

# 4b. Multi-segment name under .claude/worktrees/ → deny (no silent truncation)
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{"path":".claude/worktrees/sub/nested"}}')
assert_jq "multi-segment path → deny (not silently truncated)" \
  '.hookSpecificOutput.permissionDecision' "deny" "$OUT"
[[ ! -e "$WT_DIR/sub" ]] && pass "multi-segment path → no worktree created" \
  || fail "multi-segment path → unexpectedly created $WT_DIR/sub"

# 4c. Malformed prefix (no real boundary before .claude) → deny, not treated as canonical
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{"path":"foo.claude/worktrees/x"}}')
assert_jq "malformed .claude prefix → deny" \
  '.hookSpecificOutput.permissionDecision' "deny" "$OUT"

# 4d. Trailing slash on an otherwise valid path → tolerated (stripped), creates
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{"path":".claude/worktrees/trailing/"}}')
assert_jq "trailing slash → tolerated and normalized" \
  '.hookSpecificOutput.updatedInput.path' "$WT_DIR/trailing" "$OUT"

# 5. Name without slashes → creates worktree under .claude/worktrees, rewrites
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{"name":"my-feature"}}')
assert_valid_json "simple name → stdout is valid JSON" "$OUT"
assert_jq "simple name → updatedInput is absolute .claude/worktrees path" \
  '.hookSpecificOutput.updatedInput.path' "$WT_DIR/my-feature" "$OUT"
assert_jq "simple name → updatedInput has no name key" \
  '.hookSpecificOutput.updatedInput | has("name")' "false" "$OUT"
[[ -d "$WT_DIR/my-feature" ]] && pass "simple name → worktree dir created" \
  || fail "simple name → worktree dir NOT created"

# 5b. Idempotency: calling with the same name again reuses the existing worktree
OUT2=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{"name":"my-feature"}}')
assert_valid_json "simple name (repeat) → stdout is valid JSON" "$OUT2"
assert_jq "simple name (repeat) → same path returned" \
  '.hookSpecificOutput.updatedInput.path' "$WT_DIR/my-feature" "$OUT2"

# 6. Name WITH slashes (the bug): should sanitize, not silently fail
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{"name":"feature/pro-189-fix-test-regressions"}}')
assert_valid_json "slashed name → stdout is valid JSON" "$OUT"
REWRITTEN_PATH=$(echo "$OUT" | jq -r '.hookSpecificOutput.updatedInput.path' 2>/dev/null || echo "")
assert_jq "slashed name → updatedInput present" \
  '.hookSpecificOutput | has("updatedInput")' "true" "$OUT"
# Path must be flat under .claude/worktrees/ (no sub-slashes below the wt dir)
SUFFIX="${REWRITTEN_PATH#$WT_DIR/}"
if [[ -n "$SUFFIX" ]] && [[ "$SUFFIX" != */* ]]; then
  pass "slashed name → flat path (no sub-slashes)"
else
  fail "slashed name → path not flat: '$REWRITTEN_PATH'"
fi
[[ -n "$REWRITTEN_PATH" ]] && [[ -d "$REWRITTEN_PATH" ]] \
  && pass "slashed name → worktree dir created" \
  || fail "slashed name → worktree dir NOT created (path='$REWRITTEN_PATH')"

# 7. Empty name → generates timestamped fallback under .claude/worktrees/
OUT=$(run_hook '{"tool_name":"EnterWorktree","tool_input":{}}')
assert_valid_json "empty name → stdout is valid JSON" "$OUT"
assert_jq "empty name → updatedInput present" \
  '.hookSpecificOutput | has("updatedInput")' "true" "$OUT"
GEN_PATH=$(echo "$OUT" | jq -r '.hookSpecificOutput.updatedInput.path' 2>/dev/null || echo "")
if [[ "$GEN_PATH" == "$WT_DIR/wt-"* ]]; then
  pass "empty name → generated path under .claude/worktrees/"
else
  fail "empty name → unexpected path: '$GEN_PATH'"
fi

# 8. Legacy `.worktrees` alias symlink is created when nothing is there yet
if [[ -L "$REPO_DIR/.worktrees" ]] \
   && [[ "$(cd "$REPO_DIR" && readlink .worktrees)" == ".claude/worktrees" ]]; then
  pass "legacy .worktrees alias → symlinked to .claude/worktrees"
else
  fail "legacy .worktrees alias → not a symlink to .claude/worktrees"
fi

# 9. Anchoring: invoking the hook with CWD inside a worktree still places the
#    new worktree under the MAIN repo's .claude/worktrees (never nested).
OUT=$(cd "$WT_DIR/my-feature" && echo '{"tool_name":"EnterWorktree","tool_input":{"name":"from-nested"}}' \
  | bash "$REPO_DIR/$HOOK" 2>/dev/null || true)
assert_jq "nested CWD → placed under main repo .claude/worktrees" \
  '.hookSpecificOutput.updatedInput.path' "$WT_DIR/from-nested" "$OUT"
[[ -d "$WT_DIR/from-nested" ]] && pass "nested CWD → created at main root (not nested)" \
  || fail "nested CWD → worktree NOT created at main root"
[[ ! -e "$WT_DIR/my-feature/.claude/worktrees/from-nested" ]] \
  && pass "nested CWD → no nested worktree created" \
  || fail "nested CWD → worktree was nested inside another worktree"

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
