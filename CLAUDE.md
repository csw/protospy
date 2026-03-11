# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`protospy` is a Rust project (Cargo edition 2024) in early skeleton stage. There is also a `demo/` subdirectory containing a Python project called `elasticflix` (Python 3.14+, managed with `uv`) intended to show movies from Elasticsearch.

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
uv run python main.py   # run the demo
uv add <package>        # add a dependency
uv run ruff check .     # lint
uv run ruff format .    # format
uv run pyright .        # type check
uv run pytest           # run tests
```

## Code Quality Requirements

Before reporting a unit of work as complete (whether you are the primary agent or a subagent), **all of the following must pass** for any Python files changed under `demo/`:

```bash
cd demo
uv run ruff check .
uv run ruff format --check .
uv run pyright .
uv run pytest
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
