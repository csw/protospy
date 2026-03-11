# dev container

The repo includes a devcontainer configuration (`.devcontainer/devcontainer.json`) for Rust and Python development. It is tested with Zed on macOS with OrbStack.

The devcontainer provides:
- Rust (stable, via rustup) with clippy and rustfmt
- Node.js and Claude Code
- uv and the Python version specified in `demo/.python-version`

Elasticsearch and the OTel collector are **not** started automatically and the devcontainer has no Docker socket access. Run them from the host when needed:

```bash
docker compose up -d
```

The devcontainer reaches them via `host.docker.internal` on their published ports (9200 and 4318).

#### Claude Code configuration

`~/.claude` inside the container is stored in a named Docker volume (`protospy-claude`), so it persists across container rebuilds. On first start, authenticate and configure Claude Code (plugins, MCP servers, status line, etc.) — this is a one-time step.

To seed the volume from your host `~/.claude` rather than starting from scratch:

```bash
docker run --rm \
  -v ~/.claude:/source:ro \
  -v protospy-claude:/target \
  alpine cp -a /source/. /target/
```

To wipe the Claude config and start fresh:

```bash
docker volume rm protospy-claude
```
