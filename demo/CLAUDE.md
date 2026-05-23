# CLAUDE.md — elasticflix demo

Also read `docs/agents/python.md` at the repo root.

## Commands

```bash
uv run uvicorn elasticflix.main:app --reload   # run the demo
uv add <package>                               # add a dependency
uv run ruff check .                            # lint
uv run ruff format .                           # format
uv run pyright .                               # type check
uv run pytest -q                               # run tests (always pass -q when running as an agent)
uvx vulture src                                # check for dead code
```

Run all commands from `demo/` using `uv run`. (On the host macOS sandbox, run `cd demo/` once first — see `docs/agents/host-sandbox.md`.)

## Architecture

Demo source lives at `demo/src/elasticflix/`. See `demo/ARCHITECTURE.md` for the full architecture
reference (file map, ES query patterns, testing internals, etc.).

When changing the demo app's architecture, stack, query patterns, or testing approach, you **must**
keep both `demo/ARCHITECTURE.md` **and** the `## Architecture` section of `demo/README.md` current.

## Code Quality Requirements

Before reporting work as complete or committing, **all of the following must pass**:

```bash
uv run ruff check .
uv run ruff format .
uv run pyright .
uv run pytest -q
```

## Browser testing

To inspect network traffic during Chrome browser tests, use `read_network_requests` (the MCP tool) rather than injecting JavaScript event listeners. Clear the log with `clear: true` immediately before an action, then read it after to see exactly which requests fired and whether they were XHR or document loads.

## Committing

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/). Use scope `demo`:

```text
feat(demo): add autocomplete to search input
fix(demo): fix TemplateResponse argument order
build(demo): pin major versions for all dependencies
```

Always commit `uv.lock` alongside any changes to `pyproject.toml`.
