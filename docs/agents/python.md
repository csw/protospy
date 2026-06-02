# Working with Python code

## Dependency management

Python code uses uv.

Always commit `uv.lock` alongside any changes to `pyproject.toml` or installed packages. A pre-commit hook (`uv-lock`) will fail if the lockfile is out of date.

## One-off scripts and ad-hoc tooling

For a throwaway script that needs a third-party library — a verification check, a data probe, a quick analysis — **do not build a scratch virtualenv or `pip install` into system Python** (the latter is blocked by PEP 668 anyway). Use uv's ephemeral environments:

```bash
uv run --no-project --with pillow python verify.py
```

`--with PKG` provisions the package in a temporary environment (multiple `--with` flags stack); `--no-project` stops uv from picking up an unrelated `pyproject.toml` elsewhere in the tree.

Pick the uv entrypoint by what you need:

- **`uv run --with PKG python …`** — you need a *library* available to your own code (e.g. `from PIL import Image`). This is the common case for verification scripts.
- **`uvx CMD`** (alias for `uv tool run`) — you need to run a package's *command-line tool* (e.g. `uvx ruff`). A library like Pillow exposes no CLI, so `uvx pillow` does nothing useful. `pipx` is the same category as `uvx` (run-a-command), not an alternative for libraries — and isn't installed here regardless.

## Formatting

All Python code in this repo (both `flix/` and `conformance/`) uses ruff's default line length of **88 characters**. Write code to fit within this limit from the start — break strings, argument lists, and expressions across lines proactively rather than writing long lines and fixing them afterward.

Ruff formats multi-exception `except` clauses without parentheses: `except A, B:` rather than `except (A, B):`. This is valid Python 3.14 syntax (the comma produces a tuple expression) and is ruff's preferred style. Do not add parentheses to fight the formatter.

## Code Quality Requirements

Before reporting a unit of work as complete (whether you are the primary agent or a subagent), **all of the following must pass** for any Python files changed under `flix/` or `conformance/`:

```bash
cd <package>       # flix/ or conformance/
uv run ruff check .
uv run ruff format .
uv run pyright .
uv run pytest -q
```

Do not report "done" or commit until these are all clean.
