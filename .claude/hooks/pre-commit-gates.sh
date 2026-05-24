#!/usr/bin/env bash
# Pre-commit quality gate dispatcher for Claude Code hooks.
#
# Fires on PreToolUse(Bash). When the command is a `git commit`, runs
# subcomponent-scoped test suites (UI vitest + Playwright, flix pytest +
# e2e, conformance pytest) based on staged paths. Blocks the commit on
# failure. Layered with .pre-commit-config.yaml, which handles
# lint/format/typecheck on the same trigger.
#
# Override (intentionally undocumented outside this file):
#   PROTOSPY_SKIP_CLAUDE_GATES=1   # bypass all gates
set -euo pipefail

input="$(cat)"
command="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"
[ -z "$command" ] && exit 0

# Match `git commit` as a command head (start, or after a shell separator),
# tolerating leading env-var assignments. Rejects "git commit" buried in a
# quoted string, and sibling commands like `git commit-tree`.
commit_re='(^|[;&|(]|&&|\|\|)[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*git[[:space:]]+commit($|[[:space:]])'
if [[ ! "$command" =~ $commit_re ]]; then
    exit 0
fi

if [ "${PROTOSPY_SKIP_CLAUDE_GATES:-}" = "1" ]; then
    exit 0
fi

# Skip mid-rebase / merge / cherry-pick.
git_dir="$(git rev-parse --git-dir 2>/dev/null || true)"
if [ -n "$git_dir" ]; then
    if [ -e "$git_dir/MERGE_HEAD" ] || [ -e "$git_dir/CHERRY_PICK_HEAD" ] || \
       [ -d "$git_dir/rebase-merge" ] || [ -d "$git_dir/rebase-apply" ]; then
        exit 0
    fi
fi

# Compute staged paths. With -a/--all (incl. bundles like -am), also include
# tracked-but-unstaged modifications, since git will stage them itself.
staged="$(git diff --cached --name-only)"
all_re='(^|[[:space:]])(-[A-Za-z]*a[A-Za-z]*|--all)([[:space:]]|$)'
if [[ "$command" =~ $all_re ]]; then
    staged="$staged"$'\n'"$(git diff --name-only)"
fi
staged="$(printf '%s\n' "$staged" | awk 'NF' | sort -u)"

# Skip message-only amend (no staged changes).
amend_re='(^|[[:space:]])--amend([[:space:]]|$)'
if [[ "$command" =~ $amend_re ]] && [ -z "$staged" ]; then
    exit 0
fi

has_prefix() {
    local prefix="$1"
    printf '%s\n' "$staged" | grep -q "^$prefix"
}

run_gate() {
    local label="$1"
    shift
    printf '→ %s...\n' "$label" >&2
    if ! "$@" >&2; then
        printf '\n✗ %s failed — blocking commit\n' "$label" >&2
        exit 2
    fi
}

if has_prefix "ui/"; then
    run_gate "ui unit tests"    bash -c 'cd ui && pnpm test:coverage --run'
    run_gate "ui browser tests" bash -c 'cd ui && pnpm test:browser --reporter=dot'
fi
if has_prefix "flix/"; then
    run_gate "flix unit tests" bash -c 'cd flix && uv run pytest -q -m "not e2e"'
    run_gate "flix e2e tests"  bash -c 'cd flix && uv run pytest -m e2e -q'
fi
if has_prefix "conformance/"; then
    run_gate "conformance tests" bash -c 'cd conformance && uv run pytest -q'
fi

exit 0
