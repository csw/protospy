#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || true)

deny() {
  local reason=$1
  printf '{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":%s}}\n' \
    "$(jq -Rn --arg reason "$reason" '$reason')"
  printf '%s\n' "$reason" >&2
  exit 2
}

ask() {
  local reason=$1
  printf '{"hookSpecificOutput":{"permissionDecision":"ask","permissionDecisionReason":%s}}\n' \
    "$(jq -Rn --arg reason "$reason" '$reason')"
  printf '%s\n' "$reason" >&2
  exit 0
}

if [[ -z "$CMD" ]]; then
  exit 0
fi

if grep -Eq '(^|[;&|[:space:]])git[[:space:]]+(commit|push)([[:space:]].*)?--no-verify|--no-verify([[:space:]].*)?git[[:space:]]+(commit|push)' <<<"$CMD"; then
  deny "Blocked: --no-verify bypasses repository quality gates. Fix the issues instead of bypassing them."
fi

if grep -Eq '(^|[;&|[:space:]])git[[:space:]]+push([[:space:]].*)?(--force|-f|--force-with-lease|--force-if-includes)' <<<"$CMD"; then
  if grep -Eq '(^|[[:space:]])(origin[[:space:]]+)?(main|master)(:|[[:space:]]|$)' <<<"$CMD"; then
    deny "Blocked: force-pushing main/master is never allowed."
  fi
  ask "Force push requested. Confirm this is intentional and limited to the current feature branch."
fi

exit 0
