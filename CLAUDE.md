# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

If `CLAUDE.local.md` exists in this directory, read it for additional local guidance.

## Project Overview

`protospy` is a Rust HTTP monitoring proxy, which functions as a transparent reverse proxy for development purposes, allowing a user to interactively monitor traffic with a React UI. It uses Cargo edition 2024. This is human-written; agents should not attempt to write or modify any Rust code.

Sub-components are self-contained subprojects with their own virtualenvs, package definitions (uv or pnpm), dependencies, READMEs, CLAUDE.md files, etc. **Read the subproject's CLAUDE.md when working in it:**

- `conformance/` — HTTP reverse proxy conformance test suite (Python). See `conformance/CLAUDE.md` and `conformance/ARCHITECTURE.md`.
- `flix/` — elasticflix demo app for realistic traffic (Python 3.14+, uv). See `flix/CLAUDE.md` and `flix/ARCHITECTURE.md`.
- `ui/` — React/TypeScript UI for traffic inspection. See `ui/CLAUDE.md` and `ui/ARCHITECTURE.md`.

Agents must not make any changes to the Rust code at any time.

## Commands (Rust root)

```bash
cargo build          # build
cargo run            # run
cargo test           # run all tests
cargo test <name>    # run a single test by name
cargo clippy         # lint
```

For subproject commands, see the subproject's CLAUDE.md.

### GitHub

Use the GitHub CLI (`gh`). It is authenticated with a read-only token in the `cs` container. (On the host macOS sandbox, use the `~/bin/gh-ro` wrapper instead — see `docs/agents/host-sandbox.md`.)

## Documentation

**Consult documentation before reasoning from first principles.** Use Context7 or a web search to look up:

- How to use a tool, library, or API — before reading source, before trial-and-error
- The conventional approach to a common problem — before designing a solution

Many problems you encounter are standard: dark mode persistence, form validation, auth flows, state hydration, error boundaries. Millions of applications have solved them with the same tools you're using. When you recognize a problem as standard, your first move is to look up how it's conventionally done — not to reason about it from your training data, which may be wrong or outdated.

**The test:** if you're about to propose an approach and you haven't consulted any external source, stop. If the problem involves a well-known library doing a well-known thing, look it up first. Your confidence that you know the answer is not evidence that you do.

## Specific guidelines

There are specific agent guidelines in `docs/agents/`; read them when working with the relevant kind of code.

- `docs/agents/implementation.md`: when writing code
- `docs/agents/python.md`: when working with Python
- `docs/agents/testing.md`: when writing or maintaining tests
- `docs/agents/host-sandbox.md`: workarounds for running on the host macOS sandbox (gh-ro, worktree/git-prompt avoidance, `dangerouslyDisableSandbox` for git/Playwright/etc.) — **not applicable in the `cs` container; skip it there**
- `docs/agents/linear.md`: when working with Linear issues (e.g. `PRO-NNN` ticket references)
- `docs/agents/design.md`: when proposing a technical approach or making design decisions
- `docs/agents/dependencies.md`: when adding any dependency (packages, Actions, CDN scripts, Docker images, etc.)
- `docs/agents/ci.md`: when pushing to GitHub or investigating CI failures
- `docs/agents/quality-gates.md`: how the two-layer commit-time gates work (pre-commit framework + Claude hook)

## Worktrees

Worktrees go in `.worktrees/` at the project root. Not `.claude/worktrees/`, not `ui/.worktrees/`, not anywhere else. Pass `.worktrees/<branch-name>` as the path to `EnterWorktree` or `git worktree add`.

## File creation

Use the Write tool to create files and the Edit tool to modify them. Do not use shell constructs like `cat >
path << 'EOF'`, `echo "..." > path`, or other Bash-based file writing. These create complex compound commands
that trigger permission prompts because the shell syntax can't be statically verified. The Write and Edit
tools exist for this purpose and don't have that problem.

## Delegating noisy investigation to subagents

Repetitive, high-output investigation steps with low long-term value should be delegated to a subagent on a smaller model (e.g. Haiku) rather than run inline. Pulling raw `ps`/`lsof`/`netstat`/`grep`/log-tail output into the primary context burns the window fast and rarely retains anything worth keeping a turn later.

Delegate when the work looks like:
- "Which process is listening on port X?" — port/process/PID lookups
- Sweeping logs, journals, or large command outputs for a needle
- Repeated probing (try a command, inspect output, try another) where only the conclusion matters
- Any loop where you find yourself running the same family of commands more than twice

Brief the subagent with the specific question and ask it to report only the answer (e.g. "report the PID and command, under 50 words"). Keep inline only the steps whose full output you genuinely need to see.

## Code Quality Requirements

Before reporting a unit of work as complete or committing code changes, ensure the code quality checks pass. Each subproject's CLAUDE.md lists the specific commands to run. This applies even to trivial changes like type annotations.

**Any code path not covered by the test suite must be executed manually before committing.** For example, if you change a CLI `main()` function, start the server and confirm it runs. Do not rely on linting or type-checking alone as a substitute for actually running the code.

## Committing

All commit messages **and PR titles** must follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <description>
```

Common types: `feat`, `fix`, `docs`, `chore`, `build`, `test`, `refactor`. Scope is optional but use it where it helps (e.g. `flix`, `conformance`, `ui`).

PR titles matter because GitHub uses them as the default squash-merge commit message. A CI check enforces this — a non-conforming title will block the merge.

When work is associated with a Linear ticket, include the ticket ID in parentheses at the end of the commit message and PR title: `fix(ui): bust virtualizer cache on mode change (PRO-126)`. This links the commit to the issue in Linear.

Each subproject's CLAUDE.md has additional commit guidance (e.g. lockfile handling). Read it before committing subproject changes.

**Never bypass or override commit signing** (e.g. `-c commit.gpgsign=false`, `--no-gpg-sign`). If signing fails, stop and report the problem rather than working around it.

