#!/usr/bin/env bash
# .claude/hooks/remind-convention-skills.sh
#
# Point-of-action reminder (PRO-377). When an agent is about to edit UI source
# under ui/src/, surface the four frontend convention skills so they are loaded
# at edit time rather than only recalled from ui/AGENTS.md at session start.
#
# Wired as a PreToolUse hook on Edit|Write|MultiEdit (.claude/settings.json).
# Non-blocking: emits hookSpecificOutput.additionalContext (permissionDecision
# "allow"). The text is phrased as factual project convention, not an imperative
# system command, to avoid Claude's prompt-injection defenses suppressing it.
# Fires at most once per session, gated by a session_id marker file.
#
# The hook must never hard-fail (a failing PreToolUse hook is noise at best), so
# every extraction is guarded and the default path is a silent exit 0.
set -uo pipefail

# No jq -> can't parse; stay out of the way.
command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)

jqr() { printf '%s' "$INPUT" | jq -r "$1" 2>/dev/null || true; }

session_id=$(jqr '.session_id // empty')
cwd=$(jqr '.cwd // empty')
file_path=$(jqr '.tool_input.file_path // empty')

# Resolve a path against cwd; absolute paths pass through. Echoes the resolved
# path (best-effort; realpath -m does not require the path to exist).
resolve() {
  local p=$1
  if [[ "$p" == /* ]]; then
    printf '%s' "$p"
  else
    realpath -m -- "${cwd:-.}/$p" 2>/dev/null || printf '%s/%s' "${cwd:-.}" "$p"
  fi
}

matched=0
if [[ -n "$file_path" ]]; then
  case "$(resolve "$file_path")" in
    */ui/src/*) matched=1 ;;
  esac
else
  # Couldn't read a path (unexpected for Edit/Write/MultiEdit) -- fall back to cwd.
  case "${cwd:-}" in
    */ui/src/* | */ui/src) matched=1 ;;
  esac
fi

[[ "$matched" -eq 0 ]] && exit 0

# Once-per-session guard.
marker="${TMPDIR:-/tmp}/protospy-convskill-${session_id:-unknown}"
[[ -e "$marker" ]] && exit 0
: >"$marker" 2>/dev/null || true

reminder="Project convention (protospy UI): changes under ui/src/ follow four convention skills — shadcn, vercel-react-best-practices, vercel-composition-patterns, tailwind-4-docs. Loading them before editing is cheaper than fixing drift the convention-review subagent flags on the PR. If already loaded this session, no action is needed."

jq -cn --arg ctx "$reminder" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",additionalContext:$ctx}}'
exit 0
