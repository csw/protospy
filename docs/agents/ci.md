# CI guidance

## Watching CI runs

To watch GitHub Actions results for a commit you have pushed, use
`scripts/agents/ci-watch [workflow-name ...]` with Monitor. It pins to HEAD's
commit SHA, exits when matching runs reach a terminal state, and emits one event
per status change — this avoids picking up action results from the wrong commit,
which a bare `gh run list` readily does.

```bash
Monitor(command: "scripts/agents/ci-watch ui-ci", description: "watch UI CI run", timeout_ms: 1800000, persistent: false)
```

With no args it watches all workflows for HEAD; with args it restricts to the
named workflows (e.g. `ci-watch ui-ci docker-ci`). On the host macOS sandbox it
needs `dangerouslyDisableSandbox: true` (see `docs/agents/host-sandbox.md`).

## Debugging failures

When investigating a failed GitHub Actions run, read `docs/ci-debugging.md` before starting.
