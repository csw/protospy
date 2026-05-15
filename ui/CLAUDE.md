# CLAUDE.md — protospy UI

## Commands

```bash
pnpm dev           # start dev server
pnpm build         # production build (output: dist/)
pnpm add <package> # add a dependency
pnpm format        # format
pnpm lint          # lint
pnpm typecheck     # type check
pnpm test          # run tests
```

## Manual Testing

To generate traffic for testing UI features, use the example scripts documented in the "Running requests" section of `ui/README.md`. Do not try to inject state programmatically — run the scripts instead.

## Code Quality Requirements

Before reporting work as complete or committing, **all of the following must pass**:

```bash
pnpm lint
pnpm format
pnpm typecheck
pnpm test
```

## Versioning dependencies

Pin npm packages and CDN scripts to explicit versions:

- **npm packages**: pin to current major version.
- **CDN scripts** (`<script src="...">`): pin to an explicit version, e.g. `htmx.org@2.0.4`. Never use `@latest` or a bare major like `@3`.

When uncertain about the current version, look it up rather than guessing.

## Committing

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/). Use scope `ui`:

```text
feat(ui): add request detail sidebar
fix(ui): fix SSE reconnection on network error
refactor(ui): extract theme tokens
```
