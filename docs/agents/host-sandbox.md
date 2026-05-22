# Host sandbox workarounds

**These apply only when running Claude on the host macOS sandbox.** In the `cs`
container none of this applies — there is no `sandbox-exec` profile, `gh` and the
`linear` CLI are authenticated directly, and commit signing works without any
override. If you are in the container, skip this file.

For *why* each workaround is needed, see
[`host-sandbox-internals.md`](host-sandbox-internals.md).

## GitHub CLI

Use the read-only `gh-ro` wrapper (`~/bin/gh-ro`) instead of `gh`. It supplies a
read-only token from a file, so it works inside the sandbox without keychain
access.

## Linear CLI

Use the `~/bin/linear` wrapper instead of `linear` directly. The Deno HTTP client
the CLI uses conflicts with the sandbox's SOCKS5 proxy; the wrapper strips
`ALL_PROXY` so traffic routes through the HTTP proxy instead.

## Commands needing `dangerouslyDisableSandbox: true`

- **`git commit`** — the sandbox blocks the SSH agent socket, so signed commits
  fail with "No private key found" even when the key is loaded. (Never bypass
  signing to work around this — see the signing rule in the root `CLAUDE.md`.)
- **`git worktree remove`** — the sandbox blocks the `.git/config` writes needed
  to deregister the worktree.
- **Playwright / `pnpm test:browser`** — Chromium's Mach-port registration is
  denied by the sandbox; unit/component tests (`pnpm test`) run fine without the
  bypass.
- **`taskpolicy -b`** (CI-pressure simulation, see `testing.md`) — the sandbox
  blocks `setpriority()`.

## ci-watch

`scripts/agents/ci-watch` calls `gh` directly, which needs keychain access. On
the host, run it with `dangerouslyDisableSandbox: true` (which executes outside
the sandbox, where the keychain is reachable).
