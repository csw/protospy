#!/usr/bin/env bash
# .codex/hooks/remind-convention-skills.sh
#
# Point-of-action reminder (PRO-377), Codex side. When Codex is about to edit UI
# source under ui/src/, surface the four frontend convention skills so they are
# loaded at edit time rather than only recalled from ui/AGENTS.md at session
# start.
#
# Wired as a PreToolUse hook on the apply_patch tool (.codex/hooks.json).
# Non-blocking: emits hookSpecificOutput.additionalContext alone, phrased as
# factual project convention. Fires at most once per session, gated by a
# session_id marker file.
#
# NB: Codex honors additionalContext for an advisory PreToolUse hook only when it
# is returned on its own. Pairing it with permissionDecision:"allow" is an
# undocumented combination that Codex silently ignores (verified: the reminder
# was dropped until permissionDecision was removed). The Claude hook deliberately
# keeps permissionDecision because that pairing IS documented and verified for
# Claude Code -- the two harnesses differ here.
#
# Codex's apply_patch tool_input shape is under-documented, so path extraction is
# deliberately defensive: it reads a structured `.tool_input.path`, the raw
# `.tool_input.command`, and the whole tool_input, and pulls file paths from
# apply_patch markers (*** Add/Update/Delete File:, *** Move to:). Paths may be
# relative to cwd, so each candidate is resolved against cwd before matching. The
# hook must never hard-fail; the default path is a silent exit 0.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)

jqr() { printf '%s' "$INPUT" | jq -r "$1" 2>/dev/null || true; }

session_id=$(jqr '.session_id // empty')
cwd=$(jqr '.cwd // empty')

# Candidate path sources: a structured path field, the command string, and the
# full tool_input rendered as text (covers shapes we haven't observed).
ti_path=$(jqr '.tool_input.path // empty')
ti_command=$(jqr '.tool_input.command // empty')
ti_blob=$(jqr '.tool_input // empty | if type=="string" then . else tojson end')

# Extract file paths from apply_patch markers in a blob of patch text.
extract_marker_paths() {
  grep -oE '\*\*\* (Add File|Update File|Delete File|Move to): .+' 2>/dev/null \
    | sed -E 's/^\*\*\* (Add File|Update File|Delete File|Move to): //'
}

candidates=$(
  {
    [[ -n "$ti_path" ]] && printf '%s\n' "$ti_path"
    printf '%s' "$ti_command" | extract_marker_paths
    printf '%s' "$ti_blob" | extract_marker_paths
  } 2>/dev/null | sed '/^$/d' | sort -u
)

resolve() {
  local p=$1
  if [[ "$p" == /* ]]; then
    printf '%s' "$p"
  else
    realpath -m -- "${cwd:-.}/$p" 2>/dev/null || printf '%s/%s' "${cwd:-.}" "$p"
  fi
}

matched=0
if [[ -n "$candidates" ]]; then
  while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    case "$(resolve "$p")" in
      */ui/src/*) matched=1; break ;;
    esac
  done <<<"$candidates"
else
  # Couldn't extract any path -- fall back to cwd.
  case "${cwd:-}" in
    */ui/src/* | */ui/src) matched=1 ;;
  esac
fi

[[ "$matched" -eq 0 ]] && exit 0

marker="${TMPDIR:-/tmp}/protospy-convskill-${session_id:-unknown}"
[[ -e "$marker" ]] && exit 0
: >"$marker" 2>/dev/null || true

reminder="Project convention (protospy UI): changes under ui/src/ follow four convention skills — shadcn, vercel-react-best-practices, vercel-composition-patterns, tailwind-4-docs. Loading them before editing is cheaper than fixing drift the convention-review subagent flags on the PR. If already loaded this session, no action is needed."

jq -cn --arg ctx "$reminder" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
exit 0
