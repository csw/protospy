#!/bin/bash
# .claude/hooks/pre-tool-use.sh
set -eo pipefail

INPUT=$(cat)
CMD=$(echo "${CLAUDE_TOOL_INPUT:-$INPUT}" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Block --no-verify bypasses
if echo "$CMD" | grep -qE 'git\s+(commit|push).*--no-verify|--no-verify.*git\s+(commit|push)'; then
  echo "Blocked: --no-verify bypasses pre-commit hooks. Fix the issues first." >&2
  exit 2
fi

exit 0
