# Quality gates

`protospy` enforces code-quality checks at commit time via two layers. Both
fire on `git commit`. Together they ensure that any commit landing in the
tree has passed the relevant lint, type, and test checks for the
subcomponents it touches.

## Layer 1: pre-commit framework

`.pre-commit-config.yaml` runs the cheap checks: lint, format, and type
check across the staged subcomponents. Specifically:

- **flix/**: `ruff check --fix`, `ruff format`, `pyright`
- **conformance/**: `ruff check --fix`, `ruff format`, `pyright`
- **ui/**: `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`
- **Rust**: regenerates ts-rs bindings when `src/` or `Cargo.*` change
- Commit-message conventional-commits validation

This layer is bypassable with `git commit --no-verify`. The next layer
exists to close that gap.

## Layer 2: Claude Code hook

`.claude/settings.json` registers a `PreToolUse(Bash)` hook that calls
`.claude/hooks/pre-commit-gates.sh`. When the command being run is a
`git commit`, the hook runs the **test suites** that pre-commit
deliberately skips for speed:

- **ui/**: `pnpm test:coverage --run`, then `pnpm test:browser`
- **flix/**: `pytest -q -m "not e2e"`, then `pytest -m e2e -q`
- **conformance/**: `pytest -q`

Gates are scoped by staged paths — only the subcomponents you touched
run. Within a subcomponent, the cheaper gate runs first; the first
failure short-circuits the rest.

This layer fires before the `Bash` tool ever executes `git commit`, so
`--no-verify` cannot bypass it.

## External dependencies

Two gates need external prerequisites:

- **`pnpm test:browser`** requires Playwright browsers
  (`pnpm exec playwright install`). If missing, the gate fails with
  Playwright's own error message; install the browsers and retry.
- **`pytest -m e2e`** in `flix/` requires a running Elasticsearch
  reachable at `localhost:9200` with the demo index loaded. If ES is
  down, the gate fails with a connection error — surface this to the
  user; agents cannot start ES themselves.

## What to do when a gate blocks your commit

Read the gate output. Fix the failure (failing test, type error, etc.)
and re-attempt the commit. Do not try to bypass the gate — the gate's
purpose is to catch regressions before they enter the tree.

If a gate appears to fail for reasons unrelated to your change (e.g.
flaky browser test, environment issue), report it to the user rather
than working around it.
