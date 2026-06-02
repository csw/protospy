# Quality gates

`protospy` enforces code-quality checks at commit time via two layers. Together
they ensure quality gates run for all commit paths — manual, tool-use, and
subagent workflows.

## Layer 1: Claude Code hook

`.claude/hooks/pre-tool-use.sh` registers a `PreToolUse(Bash)` hook that
blocks any `git commit` or `git push` carrying `--no-verify`. This prevents
agents from bypassing the pre-commit framework. The hook is lightweight (no
test execution) and exits immediately if the command is not a git commit/push.

## Layer 2: pre-commit framework

`.pre-commit-config.yaml` runs lint, format, type checks, and test suites
across the staged subcomponents. Specifically:

- **flix/**: `ruff check --fix`, `ruff format`, `pyright`,
  `pytest -q -m "not e2e"` (unit), `pytest -m e2e -q` (e2e)
- **conformance/**: `ruff check --fix`, `ruff format`, `pyright`
  (tests excluded — require a live protospy + managed proxy infra; run manually
  with `just conformance test`)
- **ui/**: `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`,
  `pnpm test:coverage --run` (unit + component), `pnpm test:browser` (Playwright)
- **Rust**: regenerates ts-rs bindings when `src/` or `Cargo.*` change
- Commit-message conventional-commits validation

Within each subcomponent, checks run cheapest first. The cheap checks
(lint, format, type checks, ts-rs bindings) carry `fail_fast: true`, so a
failure in any of them halts the run before the heavyweight test suites
execute — you don't wait on Playwright or pytest when formatting is already
broken. The expensive suites themselves do not fail-fast: if they run, they
all run and report their failures together.

Note this is per-hook `fail_fast`, not a global one: pre-commit's default is
to run *every* hook regardless of failures. Only the hooks marked
`fail_fast: true` short-circuit, and they only short-circuit because they are
ordered ahead of the expensive suites.

Test commands are defined in each subproject's `justfile` and invoked via
`just <module> <recipe>` (e.g. `just ui test-browser`). This means the
same commands used in the pre-commit hooks can be run interactively.

## External dependencies

Two checks require external prerequisites:

- **`just ui test-browser`** (`pnpm test:browser`) requires Playwright browsers
  (`pnpm exec playwright install`). If missing, the gate fails with
  Playwright's own error message; install the browsers and retry.
- **`just flix test-e2e`** (`pytest -m e2e`) requires a running Elasticsearch
  reachable at `localhost:9200` with the demo index loaded. If ES is
  down, the gate fails with a connection error — surface this to the user;
  agents cannot start ES themselves.

## Mac/Linux working tree compatibility

The `ui/` hooks use `language: system` and depend on `node_modules` built for
the host platform. A working tree whose `node_modules` was installed on one
platform (macOS or Linux) will fail all `ui/` hooks on the other. The
solution is to never share a working tree across platforms: each side should
have its own checkout with its own `node_modules`. The same applies to Python
virtual environments in `flix/` and `conformance/`.

## What to do when a gate blocks your commit

Read the gate output. Fix the failure (failing test, type error, etc.)
and re-attempt the commit. Do not try to bypass the gate — the gate's
purpose is to catch regressions before they enter the tree.

If a gate appears to fail for reasons unrelated to your change (e.g.
flaky browser test, environment issue), report it to the user rather
than working around it.
