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

**Don't re-run the test suites manually right before committing.** Because the
pre-commit hook runs the full suite — `pnpm test:coverage` and `pnpm test:browser`
for `ui/`, the pytest suites for `flix/` — on every `git commit`, running those
same suites by hand immediately beforehand is pure duplication: it adds ~30–60s of
wall clock and redundant test output for no extra signal. The commit is the gate;
let the hook run them. Use `pnpm test:coverage` as an iterative feedback loop
*while developing* (after a change, to confirm it works — before you think you're
done), not as a final step you run just before `git commit`.

## External dependencies

Two checks require external prerequisites:

- **`just ui test-browser`** (`pnpm test:browser`) requires Playwright browsers
  (`pnpm exec playwright install`). If missing, the gate fails with
  Playwright's own error message; install the browsers and retry.
- **`just flix test-e2e`** (`pytest -m e2e`) requires a running Elasticsearch
  reachable at `localhost:9200` with the demo index loaded. **Agents cannot
  start Elasticsearch themselves.** Any failure attributable to ES being
  unavailable — a connection error, a timeout, a missing or empty demo index,
  a 404/index-not-found — whether it surfaces via this e2e gate, a bare
  `pytest` run, or any other path, must be surfaced to the user, not worked
  around and not treated as your own bug.

The general rule: when a check fails because a prerequisite you cannot
provision is absent, surface it to the user rather than provisioning it
yourself or rewriting your code to dodge it. (One exception: Playwright
browsers, above, you *can* install — so do.)

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

If a hook auto-fixed files in place (`ruff check --fix`, `ruff format`, and
`pnpm run format` rewrite files), re-stage them with `git add` before
re-attempting the commit, or the fixes won't be included and the gate will
fail again on the same files.

If a gate appears to fail for reasons unrelated to your change, first apply
the discipline in `docs/agents/testing.md` ("Failures are your fault until
proven otherwise"): flakiness or an environment issue is a conclusion you
earn with evidence (reproduced on clean `main`, or a confirmed missing
prerequisite you cannot provision), not a default. Only once you've met that
bar, report it to the user rather than working around it.
