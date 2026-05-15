# Working with Python code

## Dependency management

Python code uses uv.

Always commit `uv.lock` alongside any changes to `pyproject.toml` or installed packages. A pre-commit hook (`uv-lock`) will fail if the lockfile is out of date.

## Formatting

All Python code in this repo (both `demo/` and `conformance/`) uses ruff's default line length of **88 characters**. Write code to fit within this limit from the start — break strings, argument lists, and expressions across lines proactively rather than writing long lines and fixing them afterward.

Ruff formats multi-exception `except` clauses without parentheses: `except A, B:` rather than `except (A, B):`. This is valid Python 3.14 syntax (the comma produces a tuple expression) and is ruff's preferred style. Do not add parentheses to fight the formatter.

## Code Quality Requirements

Before reporting a unit of work as complete (whether you are the primary agent or a subagent), **all of the following must pass** for any Python files changed under `demo/` or `conformance/`:

```bash
cd <package>       # demo/ or conformance/
uv run ruff check .
uv run ruff format .
uv run pyright .
uv run pytest -q
```

Do not report "done" or commit until these are all clean.
