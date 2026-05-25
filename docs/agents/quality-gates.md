# Quality gates

`protospy` enforces code-quality checks at commit time via the pre-commit
framework. All checks fire on `git commit` and are scoped to the
subcomponents whose files are staged — only the components you touched run.

## pre-commit framework

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

Within each subcomponent, checks run cheapest first. The first failure
short-circuits the rest.

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
  down, use `SKIP=pytest-e2e-flix git commit` to bypass just this hook;
  surface the ES issue to the user if working interactively — agents cannot
  start ES themselves.

## Bypassing hooks

The whole gate layer is bypassable with `git commit --no-verify`. Individual
hooks can be skipped by name: `SKIP=<hook-id> git commit` (e.g.
`SKIP=pytest-e2e-flix git commit`). Use bypasses only for genuine
environmental blockers, not to skip failing tests.

The ui hooks use `language: system` and require pnpm with Linux-compatible
`node_modules` (i.e. the `cs` container). Committing `ui/` files from the
macOS host will fail those hooks; use
`SKIP=prettier-ui,eslint-ui,pnpm-typecheck-ui,pnpm-test-coverage-ui,playwright-browser-ui`
or commit from inside the container.

## What to do when a gate blocks your commit

Read the gate output. Fix the failure (failing test, type error, etc.)
and re-attempt the commit. Do not try to bypass the gate — the gate's
purpose is to catch regressions before they enter the tree.

If a gate appears to fail for reasons unrelated to your change (e.g.
flaky browser test, environment issue), report it to the user rather
than working around it.
