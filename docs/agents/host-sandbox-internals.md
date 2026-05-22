# Host sandbox internals

Background on *why* the host macOS sandbox needs the workarounds in
[`host-sandbox.md`](host-sandbox.md). This file is reference material, not
instructions — if you just need to run a tool, `host-sandbox.md` has the
actionable version.

Claude Code runs bash commands inside a `sandbox-exec` profile by default.
Sandbox exceptions can be configured in `~/.claude/settings.json` — for example,
`sandbox.network.allowMachLookup: ["com.apple.trustd.agent"]` allows TLS cert
validation via Security.framework.

## Obsidian CLI (Unix socket)

The `obsidian` CLI connects to the running Obsidian app via a Unix domain socket
at `~/.obsidian-cli.sock`. The sandbox blocks outbound Unix socket connections by
default. This is fixed in `~/.claude/settings.json` via
`sandbox.network.allowUnixSockets: ["~/.obsidian-cli.sock"]` — no
`dangerouslyDisableSandbox` override needed.

## Playwright / Chromium (mach-register)

Chromium child processes call `bootstrap_check_in` to register a Mach port named
`org.chromium.Chromium.MachPortRendezvousServer.<pid>` with launchd. The sandbox
denies this with KERN_DENIED (1100), and Playwright reports `browserType.launch:
Target page, context or browser has been closed` for every spec.

This is a **`mach-register`** (server-side) failure, not a `mach-lookup`
(client-side) failure. Adding entries to `allowMachLookup` in settings.json does
not fix it — SBPL has a separate `mach-register` operation, but Claude Code's
settings schema has no `allowMachRegister` equivalent. Hence the
`dangerouslyDisableSandbox` workaround in `host-sandbox.md`.
