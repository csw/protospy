# Versioning dependencies

When adding any dependency — Python packages, npm packages, GitHub Actions, CDN scripts, pre-commit hooks, Docker images, etc. — use the **current version** at the time of addition and pin it:

- **Python packages** (`pyproject.toml`): pin to the current major version, e.g. `"fastapi>=0,<1"`, `"pytest>=9,<10"`.
- **CDN scripts** (`<script src="...">`): pin to an explicit version, e.g. `htmx.org@2.0.4`, `alpinejs@3.14.1`. Never use `@latest` or a bare major like `@3`.
- **GitHub Actions** (`uses: owner/action@...`): pin to the current release tag, e.g. `actions/checkout@v4`.
- **Pre-commit hooks** (`.pre-commit-config.yaml`): use a frozen SHA from `pre-commit autoupdate --freeze`.
- **Docker images** (`docker-compose.yaml`): pin to a specific version tag, e.g. `elasticsearch:9.3.1`. Never use `:latest`.

When you add a dependency you are uncertain about the current version of, look it up rather than guessing.
