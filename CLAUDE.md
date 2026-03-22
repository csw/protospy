# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

If `CLAUDE.local.md` exists in this directory, read it for additional local guidance.

## Project Overview

`protospy` is a Rust project (Cargo edition 2024) in early skeleton stage. There is also a `demo/` subdirectory containing a Python project called `elasticflix` (Python 3.14+, managed with `uv`) intended to show movies from Elasticsearch. Demo source lives at `demo/src/elasticflix/`. See `docs/demo-dev.md` for development notes — keep it up to date when changing the demo app's architecture, stack, query patterns, or testing approach.

## Commands

### Rust (root)
```
cargo build          # build
cargo run            # run
cargo test           # run all tests
cargo test <name>    # run a single test by name
cargo clippy         # lint
```

### Python demo (`demo/`)
```
uv run uvicorn elasticflix.main:app --reload   # run the demo
uv add <package>        # add a dependency
uv run ruff check .     # lint
uv run ruff format .    # format
uv run pyright .        # type check
uv run pytest -q        # run tests (always pass -q when running as an agent)
uvx vulture src         # check for dead code (run from demo/)
```

### Python conformance suite (`conformance/`)
```
cd conformance
uv run pytest -q                   # run tests (default: --proxy caddy)
uv run pytest -q --proxy haproxy   # run against HAProxy
uv run ruff check .                # lint
uv run ruff format .               # format
uv run pyright .                   # type check
```

## Python Style

All Python code in this repo (both `demo/` and `conformance/`) uses ruff's default line length of **88 characters**. Write code to fit within this limit from the start — break strings, argument lists, and expressions across lines proactively rather than writing long lines and fixing them afterward.

## Code Quality Requirements

Before reporting a unit of work as complete (whether you are the primary agent or a subagent), **all of the following must pass** for any Python files changed under `demo/` or `conformance/`:

```bash
cd <package>       # demo/ or conformance/
uv run ruff check .
uv run ruff format --check .
uv run pyright .
uv run pytest -q
```

Do not report "done" or commit until these are all clean.

## CI

When investigating a failed GitHub Actions run, read `docs/ci-debugging.md` before starting.

## Committing

All commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

Common types: `feat`, `fix`, `docs`, `chore`, `build`, `test`, `refactor`. Scope is optional but use `demo` or `devcontainer` where it helps. Examples:

```
feat(demo): add autocomplete to search input
fix(demo): fix TemplateResponse argument order
build(demo): pin major versions for all dependencies
chore: add .worktrees/ to .gitignore
docs(demo): add README
```

Always commit `demo/uv.lock` alongside any changes to `demo/pyproject.toml` or installed packages. A pre-commit hook (`uv-lock`) will fail if the lockfile is out of date.

## Versioning dependencies

When adding any dependency — Python packages, npm packages, GitHub Actions, CDN scripts, pre-commit hooks, Docker images, etc. — use the **current version** at the time of addition and pin it:

- **Python packages** (`pyproject.toml`): pin to the current major version, e.g. `"fastapi>=0,<1"`, `"pytest>=9,<10"`.
- **CDN scripts** (`<script src="...">`): pin to an explicit version, e.g. `htmx.org@2.0.4`, `alpinejs@3.14.1`. Never use `@latest` or a bare major like `@3`.
- **GitHub Actions** (`uses: owner/action@...`): pin to the current release tag, e.g. `actions/checkout@v4`.
- **Pre-commit hooks** (`.pre-commit-config.yaml`): use a frozen SHA from `pre-commit autoupdate --freeze`.
- **Docker images** (`docker-compose.yaml`): pin to a specific version tag, e.g. `elasticsearch:9.3.1`. Never use `:latest`.

When you add a dependency you are uncertain about the current version of, look it up rather than guessing.
