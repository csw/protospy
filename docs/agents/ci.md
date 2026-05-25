# CI guidance

## Watching CI runs

To watch GitHub Actions results for a commit you have pushed, use
`scripts/agents/ci-watch [workflow-name ...]` with Monitor. It queries GitHub
by commit SHA (not branch), exits when matching runs reach a terminal state,
and emits one event per status change.

```bash
Monitor(command: "scripts/agents/ci-watch ui-ci", description: "watch UI CI run", timeout_ms: 1260000, persistent: false)
```

With no args it watches all workflows for HEAD; with args it restricts to the
named workflows (e.g. `ci-watch ui-ci docker-ci`). On the host macOS sandbox it
needs `dangerouslyDisableSandbox: true` (see `docs/agents/host-sandbox.md`).

### Exit behaviour

- **Exit 0, "all runs completed"** — all matching workflow runs finished.
- **Exit 0, "no CI runs found"** — the commit did not trigger any matching
  workflows (e.g. a docs-only change with no path-filter match). This is not
  an error; treat it the same as a clean CI pass.
- **Exit 1, "timed out … runs did not complete"** — runs were found but did
  not finish within the hard cap (default 20 min). Treat this as a CI failure.

The hard cap defaults to 20 min (`CI_WATCH_MAX_POLLS=40`). Set `timeout_ms`
in Monitor to slightly above that (21 min = 1 260 000 ms) so the script can
exit cleanly rather than being killed mid-message.

## Debugging failures

When investigating a failed GitHub Actions run, read `docs/ci-debugging.md` before starting.
