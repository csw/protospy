# protospy

protospy is an HTTP monitoring reverse proxy for development. It sits
transparently between your services and their upstreams, and provides a live
web UI to inspect the traffic. The use case that inspired it was inspecting
complex, dynamic Elasticsearch requests and responses which were very
inconvenient to pull out of application logs. It features OpenTelemetry
integration for associating multiple backend requests resulting from the same
incoming request.

It currently contains:

- protospy itself, a Rust application; see `src/`.
- a Python demo application, ElasticFlix (see [its README.md](flix/README.md)), in `flix/`, which searches a movie database in Elasticsearch.
- a React UI in `ui/`.
- a Docker Compose configuration to run the demo application, Elasticsearch, and Jaeger.
- an HTTP proxy conformance test suite in `conformance/` to validate proxy behavior, intended for protospy and using Caddy and HAProxy as reference points. See [docs](docs/conformance-tests.md).

There's also a demo instance at https://demo.protospy.io/.

![Body inspector showing a rich Elasticsearch request and response](docs/screenshots/03-body.png)

## Status

**v0.2, pre-release.** protospy is early and rough, and not yet
announced. It works, but interfaces, configuration, and behavior may change
without notice, and rough edges are expected. Feedback is welcome; polish
is the next stage.

## Local demo usage

This is a self-contained Docker Compose-based demo environment sufficient
to see protospy in action. It has a toy application, Elasticflix, which
searches a movie database in Elasticsearch, proxied via protospy, with OpenTelemetry activity reporting to Jaeger.

### Start services

First, bring up the container services:

```shell
docker compose up -d
```

When running this for the first time, load the movie data into Elasticsearch:

```shell
docker compose run --rm flix python loader.py
```

### Observe traffic

1. Go to the protospy interface at http://localhost:3101/.
2. In another tab, go to the demo Elasticflix application at http://localhost:8001/.
3. Search for movies in Elasticflix and observe that traffic appears in protospy.
4. Select HTTP exchanges and see their request and response bodies, as well as headers.

OpenTelemetry data is available in Jaeger at http://localhost:16686/.

## Configuration

protospy is designed to run containerized, with environment-variable-based 12-factor configuration. It can run multiple proxy services, each listening on its own port and forwarding traffic to its own target; these are named, with their settings under the `PROXY__<name>__` prefix, with double underscores.

A simple example for a single service:

```text
PROXY__ES__PORT=3000
PROXY__ES__TARGET=elasticsearch:9200
PROXY__ES__PROTOCOL=Elasticsearch
```

Proxy settings:

- `PROXY__<name>__PORT`: port to listen on
- `PROXY__<name>__ADDR`: (optional) address to listen on, defaults to all (`[::]`)
- `PROXY__<name>__TARGET`: URL to connect to; a bare `host:port`, e.g. `db:9200`, will be interpreted as an HTTP URL

Server settings:

- `LISTEN_PORT`: port to listen on for UI
- `LISTEN_ADDR`: (optional) address to listen on for UI, defaults to all (`[::]`)
- `WEB`: enable UI web interface, defaults to true
- `PRINT_MESSAGES`: print HTTP exchanges to stdout

Server settings for development:

- `TOKIO_CONSOLE`: enable monitoring with [tokio-console][]
- `RECORD_EXAMPLES`: write requests and responses to the specified directory, to generate e.g. `docs/examples/`

[tokio-console]: https://github.com/tokio-rs/console

## Development

See the READMEs of the supporting components for their own specifics:

- [flix/README.md](flix/README.md)
- [conformance/README.md](conformance/README.md)
- [ui/README.md](ui/README.md)

Agent-assisted development workflows are documented in
[docs/agent-dev.md](docs/agent-dev.md).

### Dependencies

#### Root project

- **Rust** 1.88+ — the proxy is written in Rust; install via [rustup](https://rustup.rs)
- **Docker Compose** — runs the demo services (Elasticsearch, Jaeger, ElasticFlix)
- **[just](https://just.systems)** — task runner used for build, run, and publish recipes
- **[pre-commit](https://pre-commit.com)** — commit-time lint, format, and validation hooks; install hooks after cloning (see [Setup](#setup))

Additional Rust tools used in development:

```shell
cargo install cargo-audit --locked   # dependency vulnerability audit
cargo install cargo-tarpaulin --locked  # code coverage
```

#### ui/ — React frontend

- **Node.js** 22+ — JavaScript runtime
- **pnpm** 10+ — package manager (`npm install -g pnpm` or via [pnpm docs](https://pnpm.io/installation))

See [ui/README.md](ui/README.md) for setup and dev commands.

The current UI **bestiary** — a browsable catalog of the UI's display states
(the fixture matrix), republished automatically on every UI change merged to
`main` — is always available at a fixed URL:
[bestiary/current](https://protospy-dev-data.s3.amazonaws.com/bestiary/current/index.html).

#### flix/ — ElasticFlix demo app

- **Docker** with **Compose** plugin — for running the Elasticsearch container (same Docker Compose install as the root project)
- **uv** — Python package manager ([install](https://docs.astral.sh/uv/getting-started/installation/))
- **Python** 3.14+ — managed by `uv`; no separate install needed if using `uv`

See [flix/README.md](flix/README.md) for setup.

#### conformance/ — HTTP conformance test suite

- **uv** — Python package manager (same as above)
- **Python** 3.14+ — managed by `uv`
- **Caddy** 2.11.3+ and **HAProxy** 3.2+ — reference proxy binaries, required only when running `--proxy caddy`, `--proxy haproxy`, or `--proxy all`; not needed for `--proxy protospy`

See [conformance/README.md](conformance/README.md) for details.

#### demo/ — static demo wrapper

No additional prerequisites. The demo is served by `serve.py`, a stdlib-only Python static file server.

### Setup

#### pre-commit

This uses [pre-commit](https://pre-commit.com) for commit validation. If necessary, install it with `uv tool install pre-commit` or similar. Then, install the hooks:

```shell
pre-commit install -t pre-commit -t commit-msg -t post-checkout
```

This installs three hook stages:

- `pre-commit` — lint, format, type-check, and ts-rs binding checks
- `commit-msg` — Conventional Commits validation
- `post-checkout` — symlinks Claude config (skills, hooks, agents, local settings) into new worktrees so agents have the right environment

### Conventions

All commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/).

### Publishing to crates.io

The published crate includes pre-built UI assets from `ui/dist/`. Use the justfile recipes to build the UI and publish in one step:

```shell
just publish-dry-run   # build UI, package crate, verify contents
just publish           # build UI, dry-run, confirm, then upload
```

`just publish` runs a dry-run first, then prompts for confirmation before uploading. Pass `just --yes publish` to skip the prompt.

## AI usage

The protospy proxy itself is a Rust application written entirely by hand,
with no AI usage. (Aside from figuring out the occasional type error.)

The rest of the project (web UI, demo app, conformance suite, and tooling)
has been written largely by AI agents, with careful direction and review.
