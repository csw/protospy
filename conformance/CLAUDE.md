# CLAUDE.md — conformance test suite

Also read `docs/agents/python.md` and `docs/agents/testing.md` at the repo root.

## Commands

```bash
uv run pytest -q                   # run tests (default: both caddy and haproxy)
uv run pytest -q --proxy caddy     # run against Caddy only
uv run pytest -q --proxy haproxy   # run against HAProxy only
uv run pytest -q --findings        # show proxy behavioral findings
uv run ruff check .                # lint
uv run ruff format .               # format
uv run pyright .                   # type check
```

Run all commands from `conformance/` using `uv run`.

## Architecture

Tests are in `tests/`, infrastructure is in `src/proxy_conformance/`. See `docs/conformance-tests.md` for general information and `docs/conformance-test-catalog.md` for the catalog of tested behaviors.

## Code Quality Requirements

Before reporting work as complete or committing, **all of the following must pass**:

```bash
uv run ruff check .
uv run ruff format .
uv run pyright .
uv run pytest -q
```

## Committing

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/). Use `test` or `refactor` as the type with scope `conformance`:

```text
test(conformance): add chunked transfer-encoding probe
refactor(conformance): extract shared assertion helpers
```

Always commit `uv.lock` alongside any changes to `pyproject.toml`.
