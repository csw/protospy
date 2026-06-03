#!/usr/bin/env python3
"""Analyze Claude Code token usage from session transcripts."""

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"


def parse_since(since_str: str) -> datetime:
    """Parse a --since value: relative (e.g. '8h', '2d') or absolute date."""
    match = re.fullmatch(r"(\d+)([hHdDmM])", since_str)
    if match:
        value, unit = int(match.group(1)), match.group(2).lower()
        delta = {
            "h": timedelta(hours=value),
            "d": timedelta(days=value),
            "m": timedelta(minutes=value),
        }
        return datetime.now(timezone.utc) - delta[unit]
    try:
        dt = datetime.fromisoformat(since_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        print(f"Error: cannot parse --since '{since_str}'", file=sys.stderr)
        print("  Use relative (8h, 2d, 30m) or ISO date (2026-06-02)", file=sys.stderr)
        sys.exit(1)


def parse_timestamp(ts: str) -> datetime | None:
    if not ts:
        return None
    try:
        ts = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(ts)
    except ValueError:
        return None


def find_project_dirs(project_filter: str | None) -> list[Path]:
    """Find Claude project directories, optionally filtered by substring."""
    if not CLAUDE_PROJECTS_DIR.exists():
        return []
    dirs = [d for d in CLAUDE_PROJECTS_DIR.iterdir() if d.is_dir()]
    if project_filter:
        dirs = [d for d in dirs if project_filter in d.name]
    return sorted(dirs)


def find_session_files(project_dirs: list[Path], since: datetime | None) -> list[Path]:
    """Find JSONL session files, optionally filtered by modification time."""
    files = []
    for d in project_dirs:
        for f in d.glob("*.jsonl"):
            if (
                since
                and datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc) < since
            ):
                continue
            files.append(f)
    return sorted(files, key=lambda f: f.stat().st_mtime)


class SessionStats:
    def __init__(self, session_id: str, path: Path):
        self.session_id = session_id
        self.path = path
        self.project = path.parent.name
        self.agent_setting: str | None = None
        self.model: str | None = None
        self.first_ts: datetime | None = None
        self.last_ts: datetime | None = None
        self.input_tokens = 0
        self.output_tokens = 0
        self.cache_read_tokens = 0
        self.cache_create_tokens = 0
        self.turns = 0
        self.subagent_spawns: list[dict] = []


def parse_session(path: Path, since: datetime | None) -> SessionStats | None:
    session_id = path.stem
    stats = SessionStats(session_id, path)
    seen_msg_ids: dict[str, dict] = {}

    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue

            rec_type = record.get("type")

            if rec_type == "agent-setting":
                stats.agent_setting = record.get("agentSetting")
                continue

            ts = parse_timestamp(record.get("timestamp", ""))
            if ts:
                if stats.first_ts is None or ts < stats.first_ts:
                    stats.first_ts = ts
                if stats.last_ts is None or ts > stats.last_ts:
                    stats.last_ts = ts

            if rec_type == "assistant":
                msg = record.get("message", {})
                msg_id = msg.get("id")
                if msg_id:
                    seen_msg_ids[msg_id] = record

    if since and stats.last_ts and stats.last_ts < since:
        return None

    for msg_id, record in seen_msg_ids.items():
        msg = record.get("message", {})
        usage = msg.get("usage", {})

        if not stats.model:
            stats.model = msg.get("model")

        stats.input_tokens += usage.get("input_tokens", 0)
        stats.output_tokens += usage.get("output_tokens", 0)
        stats.cache_read_tokens += usage.get("cache_read_input_tokens", 0)
        stats.cache_create_tokens += usage.get("cache_creation_input_tokens", 0)
        stats.turns += 1

        for block in msg.get("content", []):
            if block.get("type") == "tool_use" and block.get("name") == "Agent":
                inp = block.get("input", {})
                stats.subagent_spawns.append(
                    {
                        "type": inp.get("subagent_type", "general-purpose"),
                        "description": inp.get("description", ""),
                        "model": inp.get("model"),
                    }
                )

    if stats.turns == 0:
        return None

    return stats


def format_tokens(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


def format_duration(first: datetime | None, last: datetime | None) -> str:
    if not first or not last:
        return "?"
    delta = last - first
    total_seconds = int(delta.total_seconds())
    if total_seconds < 60:
        return f"{total_seconds}s"
    minutes = total_seconds // 60
    if minutes < 60:
        return f"{minutes}m"
    hours = minutes // 60
    remaining = minutes % 60
    return f"{hours}h{remaining}m"


def print_session_table(sessions: list[SessionStats]) -> None:
    headers = [
        "Session",
        "Agent",
        "Model",
        "Duration",
        "Turns",
        "Input",
        "Cache Read",
        "Cache Create",
        "Output",
        "Agents",
    ]
    rows = []
    for s in sessions:
        agent_types = [sp["type"] for sp in s.subagent_spawns]
        agent_summary = ""
        if agent_types:
            counts = defaultdict(int)
            for t in agent_types:
                counts[t] += 1
            agent_summary = ", ".join(
                f"{t}({c})" if c > 1 else t for t, c in counts.items()
            )

        rows.append(
            [
                s.session_id[:12],
                s.agent_setting or "-",
                (s.model or "?").removeprefix("claude-"),
                format_duration(s.first_ts, s.last_ts),
                str(s.turns),
                format_tokens(s.input_tokens),
                format_tokens(s.cache_read_tokens),
                format_tokens(s.cache_create_tokens),
                format_tokens(s.output_tokens),
                agent_summary or "-",
            ]
        )

    col_widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            col_widths[i] = max(col_widths[i], len(cell))

    def format_row(cells: list[str]) -> str:
        right_align = {4, 5, 6, 7, 8}
        parts = []
        for i, cell in enumerate(cells):
            if i in right_align:
                parts.append(cell.rjust(col_widths[i]))
            else:
                parts.append(cell.ljust(col_widths[i]))
        return "  ".join(parts)

    print(format_row(headers))
    print("  ".join("-" * w for w in col_widths))
    for row in rows:
        print(format_row(row))


def print_summary(sessions: list[SessionStats]) -> None:
    total_input = sum(s.input_tokens for s in sessions)
    total_output = sum(s.output_tokens for s in sessions)
    total_cache_read = sum(s.cache_read_tokens for s in sessions)
    total_cache_create = sum(s.cache_create_tokens for s in sessions)
    total_turns = sum(s.turns for s in sessions)

    print(f"\nTotals across {len(sessions)} session(s), {total_turns} turns:")
    print(f"  Input:        {format_tokens(total_input)}")
    print(f"  Cache read:   {format_tokens(total_cache_read)}")
    print(f"  Cache create: {format_tokens(total_cache_create)}")
    print(f"  Output:       {format_tokens(total_output)}")

    by_model: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for s in sessions:
        model = s.model or "unknown"
        by_model[model]["input"] += s.input_tokens
        by_model[model]["output"] += s.output_tokens
        by_model[model]["cache_read"] += s.cache_read_tokens
        by_model[model]["cache_create"] += s.cache_create_tokens
        by_model[model]["sessions"] += 1

    if len(by_model) > 1:
        print("\nBy model:")
        for model, totals in sorted(by_model.items()):
            print(
                f"  {model}: {totals['sessions']} session(s), "
                f"in={format_tokens(totals['input'])} "
                f"cache_read={format_tokens(totals['cache_read'])} "
                f"cache_create={format_tokens(totals['cache_create'])} "
                f"out={format_tokens(totals['output'])}"
            )

    all_spawns: list[dict] = []
    for s in sessions:
        all_spawns.extend(s.subagent_spawns)

    if all_spawns:
        print("\nSubagent spawns:")
        counts: dict[str, int] = defaultdict(int)
        for sp in all_spawns:
            counts[sp["type"]] += 1
        for agent_type, count in sorted(counts.items(), key=lambda x: -x[1]):
            print(f"  {agent_type}: {count}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Analyze Claude Code token usage from session transcripts."
    )
    parser.add_argument(
        "--since",
        help="Filter sessions by time: relative (8h, 2d, 30m) or ISO date (2026-06-02)",
    )
    parser.add_argument(
        "--project",
        help="Filter by project directory name substring (e.g. 'protospy')",
    )
    parser.add_argument(
        "--session",
        help="Analyze a specific session by ID prefix",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show per-session subagent details",
    )
    args = parser.parse_args()

    since = parse_since(args.since) if args.since else None

    project_dirs = find_project_dirs(args.project)
    if not project_dirs:
        print("No project directories found.", file=sys.stderr)
        sys.exit(1)

    session_files = find_session_files(project_dirs, since)
    if args.session:
        session_files = [f for f in session_files if f.stem.startswith(args.session)]

    if not session_files:
        print("No matching session files found.", file=sys.stderr)
        sys.exit(1)

    sessions = []
    for path in session_files:
        stats = parse_session(path, since)
        if stats:
            sessions.append(stats)

    if not sessions:
        print("No sessions with data found in the given range.", file=sys.stderr)
        sys.exit(1)

    sessions.sort(key=lambda s: s.first_ts or datetime.min.replace(tzinfo=timezone.utc))

    print_session_table(sessions)
    print_summary(sessions)

    if args.verbose:
        print("\n--- Subagent details ---")
        for s in sessions:
            if s.subagent_spawns:
                print(f"\n{s.session_id[:12]} ({s.agent_setting or '-'}):")
                for sp in s.subagent_spawns:
                    model_str = f" model={sp['model']}" if sp.get("model") else ""
                    print(f"  {sp['type']}: {sp['description']}{model_str}")


if __name__ == "__main__":
    main()
