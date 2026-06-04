# Token / session-cost analytics

When you need to know what a session, day, or model **cost** — or to audit where
tokens go — reach for an off-the-shelf tool rather than parsing session JSONL by
hand. Decision recorded in PRO-302.

## Cost / usage accounting — use **ccusage**

[`ryoppippi/ccusage`](https://github.com/ryoppippi/ccusage) is the standing
instrument for "what did this cost." Run it with no install:

```bash
npx ccusage@latest session            # per-session USD cost + token breakdown
npx ccusage@latest claude daily       # daily rollup, Claude only
npx ccusage@latest session --json     # machine-readable
```

It dedupes resume/branch replays (`message.id` + `requestId`), reads all four
token fields (input, output, cache-create, cache-read), and prices via LiteLLM
(current model pricing). Reports group by session / day / week / month / 5-hour
billing block, with per-model `--breakdown` and `--instances` project grouping.

It does **not** attribute cost to subagent types, break down by tool/command, or
correlate sidechains — it is a pure cost aggregator.

## By-tool / by-command audit & waste detection — **CodeBurn**, ad-hoc

For a PRO-301-style audit ("which tools/commands dominate, where's the waste"),
[`getagentseal/codeburn`](https://github.com/getagentseal/codeburn) adds a
by-tool and by-shell-command breakdown plus retry/waste detection:

```bash
npx codeburn@latest export --format json   # tools[], shellCommands[], sessions[]
npx codeburn@latest optimize               # waste / retry-storm detection
```

Caveat: its tool/command breakdown is **call-count share, not tokens-per-tool** —
per-tool token cost is *not derivable* from the JSONL (`usage` is reported per
assistant message, never per `tool_result`). CodeBurn is pre-1.0; use it ad-hoc,
not as standing infra.

## Transcript navigation & subagent correlation — the `claude-session-history` skill

For reading a transcript, grepping across sessions, or correlating a subagent
("sidechain") back to the `Task` that spawned it — things the cost tools don't
do — use the `claude-session-history` skill's `session_tools.py`. That skill is
the sole home for DIY session-JSONL parsing; do not write a parallel parser.
