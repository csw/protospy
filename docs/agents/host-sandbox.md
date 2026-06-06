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

## Running git in a different directory

Never use `cd /path && git ...` — this triggers an "untrusted hooks" approval prompt. Use `git -C` instead:

```bash
# Good
git -C /path/to/dir add file.txt
git -C /path/to/dir commit -m "message"

# Bad — triggers approval prompt
cd /path/to/dir && git add file.txt && git commit -m "message"
```

If you are already in the target directory (including inside a worktree), run git commands directly with no `cd` prefix.

## Worktrees

When the `using-git-worktrees` skill runs Step 0 isolation detection, execute each git command as a **separate Bash call** — not combined into a single compound shell expression.

**This overrides the skill's own Step 0 code example**, which uses a combined form that cannot be statically analyzed and triggers an unnecessary approval prompt.

Run these individually:

```bash
git rev-parse --git-dir
git rev-parse --git-common-dir
git branch --show-current
git rev-parse --show-superproject-working-tree 2>/dev/null
```

Do **not** combine them into a single expression such as:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P) && ...
```

The individual commands are pre-approved and run without confirmation.

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

This list is illustrative, not exhaustive. If any command fails with a
sandbox-related error not listed above — SSH-agent or keychain access denied,
Mach-port registration denied, a blocked privileged syscall — the cause is
almost certainly the same sandbox restriction; re-run it with
`dangerouslyDisableSandbox: true`. (Still never disable commit signing to work
around a failure — see the signing rule in the root `CLAUDE.md`.)

## ci-watch

`scripts/agents/ci-watch` calls `gh` directly, which needs keychain access. On
the host, run it with `dangerouslyDisableSandbox: true` (which executes outside
the sandbox, where the keychain is reachable).
