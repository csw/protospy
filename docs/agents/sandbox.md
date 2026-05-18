# macOS sandbox notes

Claude Code runs bash commands inside a `sandbox-exec` profile by default. Sandbox exceptions can be configured in `~/.claude/settings.json` — for example, `sandbox.network.allowMachLookup: ["com.apple.trustd.agent"]` allows TLS cert validation via Security.framework.

## Playwright / Chromium (mach-register)

Chromium child processes call `bootstrap_check_in` to register a Mach port named `org.chromium.Chromium.MachPortRendezvousServer.<pid>` with launchd. The sandbox denies this with KERN_DENIED (1100), and Playwright reports `browserType.launch: Target page, context or browser has been closed` for every spec.

This is a **`mach-register`** (server-side) failure, not a `mach-lookup` (client-side) failure. Adding entries to `allowMachLookup` in settings.json does not fix it — SBPL has a separate `mach-register` operation, but Claude Code's settings schema has no `allowMachRegister` equivalent.

**Workaround:** use `dangerouslyDisableSandbox: true` when running Playwright tests. Unit/component tests (`pnpm test`) run fine in the sandbox; only browser tests (`pnpm test:browser`) need the bypass.

## CI watching

To watch GitHub Actions runs on the current commit, if the `~/bin/ci-watch` helper is available, use `~/bin/ci-watch [workflow-name ...]` with Monitor or `Bash` `run_in_background`.

The script pins to HEAD's commit SHA on the current branch, exits when every matching run reaches a terminal state, and emits one stdout line per status change. With no args, watches all workflows triggered by HEAD. With args, restricts to matching workflow names.

```bash
ci-watch                # all workflows
ci-watch ui-ci          # only this workflow
ci-watch ui-ci docker-ci
```

Usage: `Monitor(command: "ci-watch ui-ci", description: "watch UI CI", timeout_ms: 1800000, persistent: false)`.

Why the script exists rather than inlining the loop in each agent:

- **Pin to `headSha`** — prevents overlapping pushes from shifting the `--limit` window and watching the wrong commit.
- **Guard the empty case** — `jq 'all(.status=="completed")'` returns `true` on an empty array, so without a count check the watch terminates immediately.
- **Don't lose errors** — ensures `gh-ro` failures surface rather than getting swallowed.

These are easy to get wrong; the script removes the footgun.
