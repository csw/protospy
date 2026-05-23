# CLAUDE.md — conformance test suite

Also read `docs/agents/python.md` and `docs/agents/testing.md` at the repo root.

## Commands

```bash
uv run pytest -q                   # run tests (default: all managed proxies)
uv run pytest -q --proxy caddy     # run against Caddy only
uv run pytest -q --proxy haproxy   # run against HAProxy only
uv run pytest -q --findings        # show proxy behavioral findings
uv run ruff check .                # lint
uv run ruff format .               # format
uv run pyright .                   # type check
```

Run all commands from `conformance/` using `uv run`. (On the host macOS sandbox, run `cd conformance/` once first — see `docs/agents/host-sandbox.md`.)

## Architecture

Tests are in `tests/`, infrastructure is in `src/proxy_conformance/`. See:

- `docs/conformance-tests.md` — testing concept, assertion policy, quirks, findings model.
- `docs/conformance-test-catalog.md` — catalog of tested behaviors (categories 1–19).
- `conformance/ARCHITECTURE.md` — **code-level architecture**: module roles, fixture wiring, file map, channel taxonomy. Read this before working on the harness.

**Keep-up-to-date rule:** When you change harness code or directory structure, update BOTH `conformance/ARCHITECTURE.md` AND the `## Architecture` section of `conformance/README.md` to reflect the change. Both docs must stay in sync with the code.

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
