# protospy

This will be a Rust monitoring proxy for development use, to give a live view of HTTP traffic between services with OpenTelemetry integration.

It currently contains:
 - a Python demo application, ElasticFlix (see [its README.md](demo/README.md)), in `demo/`, which searches a movie database in Elasticsearch.
 - a Docker Compose configuration to run the demo application, Elasticsearch, and Jaeger.
 - an HTTP proxy conformance test suite to validate proxy behavior, intended for protospy and using Caddy and HAProxy as reference points. See [docs](docs/conformance-tests.md).

## Development

### Dependencies

- Rust (future)
- Docker Compose
- [uv](https://docs.astral.sh/uv/) for Python demo service in `demo/`
- [pre-commit](https://pre-commit.com)

### Setup

#### pre-commit

This uses [pre-commit](https://pre-commit.com) for commit validation. If necessary, install it with `uv tool install pre-commit` or similar. Then, install the hooks, including the `commit-msg` hook for Conventional Commits:

```shell
pre-commit install -t pre-commit -t commit-msg
```

### Conventions

All commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/).

### devcontainers

The repo includes a devcontainer configuration (`.devcontainer/devcontainer.json`) for Rust and Python development. It is tested with Zed on macOS with OrbStack.

See [docs/devcontainers.md](docs/devcontainers.md) for details.
