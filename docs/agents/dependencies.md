# Versioning dependencies

When adding or upgrading any dependency (or changing how one is pinned) — Python packages, npm packages, GitHub Actions, CDN scripts, pre-commit hooks, Docker images, and any other dependency type — use the **current version** at the time of the change and pin it:

- **Python packages** (`pyproject.toml`): pin to the current major version, e.g. `"fastapi>=0,<1"`, `"pytest>=9,<10"`.
- **CDN scripts** (`<script src="...">`): pin to an explicit version, e.g. `htmx.org@2.0.4`, `alpinejs@3.14.1`. Never use `@latest` or a bare major like `@3`.
- **GitHub Actions** (`uses: owner/action@...`): pin to the current release tag, e.g. `actions/checkout@v4`.
- **Pre-commit hooks** (`.pre-commit-config.yaml`): use a frozen SHA from `pre-commit autoupdate --freeze`.
- **Docker images** (`docker-compose.yaml`): pin to a specific version tag, e.g. `elasticsearch:9.3.1`. Never use `:latest`.
- **Any dependency type not listed above**: apply the same principle — pin to a specific current version, never a floating tag (`latest`, a bare major, `main`).

Always look up the current version before pinning — query the registry (PyPI, npm, the action's releases page, Docker Hub) or use Context7. Do not rely on your own recollection of the current version; treat your training data as stale even when you feel certain.

## Keeping the README current

When a change adds, removes, or changes the minimum version of a development prerequisite — a tool, runtime, or binary required to build or develop any part of the project — update the `### Dependencies` section in the root `README.md` in the same PR. This applies to root-project tools and to subproject prerequisites listed there.

