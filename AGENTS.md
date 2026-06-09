# AGENTS.md

This file provides shared guidance to Claude Code and Codex when working with
code in this repository.

Personal, uncommitted guidance is harness-specific: Claude Code reads
`CLAUDE.local.md`; Codex reads `AGENTS.override.md`.

## Project Overview

`protospy` is a Rust HTTP monitoring proxy. It functions as a transparent
reverse proxy for development, letting a user monitor traffic through a React UI.
It uses Cargo edition 2024. The Rust code is human-written; agents must not
write or modify Rust code.

Sub-components are self-contained subprojects with their own package definitions,
dependencies, READMEs, and instruction files. Read the subproject's `AGENTS.md`
when working in it:

- `conformance/` - HTTP reverse proxy conformance test suite (Python). See
  `conformance/AGENTS.md` and `conformance/ARCHITECTURE.md`.
- `flix/` - elasticflix demo app for realistic traffic (Python 3.14+, uv). See
  `flix/AGENTS.md` and `flix/ARCHITECTURE.md`.
- `ui/` - React/TypeScript UI for traffic inspection. See `ui/AGENTS.md` and
  `ui/ARCHITECTURE.md`.
- `demo/` - static demo wrapper. See `demo/AGENTS.md`.

Agents must not make any changes to Rust code at any time.

## Commands (Rust root)

```bash
cargo build          # build
cargo run            # run
cargo test           # run all tests
cargo test <name>    # run a single test by name
cargo clippy         # lint
```

For subproject commands, see the subproject's `AGENTS.md`.

### GitHub

Use the GitHub CLI. In the `cs` container, use `gh`; on the host macOS sandbox,
use `~/bin/gh-ro` unless the active harness provides a working `gh` command.
The token has read access plus limited writes such as `gh pr ready`; when you
need an allowed write, attempt it rather than assuming it is blocked.

After any push that can trigger CI - a new branch, a new PR, or follow-up commits
to an existing PR branch - watch that run to completion with
`scripts/agents/ci-watch`; see `docs/agents/ci.md`. Never use the Checks API as
a fallback. Query CI through the Actions API by commit SHA (`gh run list
--commit <sha>`), exactly as `ci-watch` does.

## Documentation

You must consult documentation before reasoning from first principles - via
Context7 or web search - both for how to use any tool, library, or API and for
the conventional approach to common problems. Before proposing any approach that
uses a well-known library for a well-known task, look it up first.

## Linear Tickets

When your task references a Linear ticket (`PRO-NNN`), read that ticket and its
parent issue before you start. Also read the titles of sibling tickets under the
same parent, and open any sibling whose title suggests it bears on your work.

Use the Linear CLI for implementer workflows. Get the parent and children with:

```bash
linear issue view PRO-NNN --json
```

Inspect `.parent.identifier` and `.children.nodes[].identifier`; see
`docs/agents/linear.md`.

## Refer to Roles, Not People by Name

This is an open-source project. Do not name the maintainer or any individual in
durable text you produce - commit messages, PR titles and descriptions, code
comments, design notes, ticket comments, or docs. Phrase deferrals and open
questions in terms of the role or the decision.

Naming a person in a one-off message to the user in this session is fine; the
rule is about text that gets committed or otherwise persists.

## Specific Guidelines

There are specific agent guidelines in `docs/agents/`. Read every guide whose
trigger plausibly applies, interpreting triggers broadly. More than one guide
usually applies to a single task.

- `docs/agents/implementation.md`: when writing, modifying, refactoring, or
  debugging code
- `docs/agents/python.md`: when working with Python, or writing an ad-hoc Python
  script
- `docs/agents/testing.md`: when writing or maintaining tests
- `docs/agents/host-sandbox.md`: when running Claude Code on the host macOS
  sandbox
- `docs/agents/linear.md`: when working with Linear issues
- `docs/agents/design.md`: when proposing a technical approach or making design
  decisions
- `docs/agents/dependencies.md`: when adding dependencies
- `docs/agents/ci.md`: when pushing to GitHub or investigating CI
- `docs/agents/quality-gates.md`: how commit-time gates work
- `docs/agents/worktrees.md`: worktree setup and harness-specific conventions
- `docs/agents/prompt-authoring.md`: when modifying prompts, skills, agent
  definitions, commands, or instruction files
- `docs/agents/tldr-maintenance.md`: when changing a subproject's architecture,
  stack, data flow, directory structure, or README architecture section
- `docs/agents/token-economics.md`: when measuring token cost

## Review and Visual-Quality Tooling

The UI has dedicated review tooling beyond the built-in code review. Each tool
documents its own procedure, output location, and scope. `handle-ticket` wires
the per-ticket flow together.

- `protospy-design-review` skill - rendered visual-quality check of the app.
- `visual-review` subagent - heavyweight fixture-matrix visual sweep.
- `convention-review` subagent - React/Tailwind/shadcn convention review.
- `design-system-conformance-review` subagent - code review against
  `docs/ui/design-system.md` and the token-resolution helper.
- `review-synthesis` subagent - reconciles review findings.
- `docs/frontend-dod.md` - frontend Definition of Done.

Claude agent definitions live under `.claude/agents/`. Codex agent definitions
live under `.codex/agents/`.

## Agent Configuration

Project-shared skills live under `.agents/skills/`; local/generated skills stay
ignored and may be symlinked into worktrees by harness-specific setup. The
phase-one shared skill set is `handle-ticket`, `linear-cli`, `obsidian-cli`,
`playwright-cli`, and `protospy-design-review`. `handle-ticket-team` and PM
agent wiring are out of scope for host Codex implementer work.

Codex implementer MCP configuration is intentionally minimal: Context7 only.
Linear remains CLI-based via `linear` / `linear-cli`; Obsidian remains
filesystem/CLI-based via `obsidian-cli` when needed.

## Worktrees

Implementation work should happen in worktrees for both harnesses.

Claude Code keeps the project-managed `.claude/worktrees/<branch-name>` flow;
see `docs/agents/worktrees.md`.

Codex uses Codex-native app worktrees. Do not assume a fixed `.Codex/worktrees`
path. For ticket work, create or check out a recognizable branch inside the
Codex worktree before implementation. Prefer Linear's `branchName`; otherwise
use a shape like `codex/pro-123-short-title-slug`.

## Delegating Noisy Investigation

Delegate repetitive, high-output investigation to a subagent when only the
conclusion matters. Examples include port/process lookups, sweeping logs for a
needle, or repeated probing where raw output is not useful after the turn.

Brief the subagent with the specific question and ask for a concise answer.

## Code Quality Requirements

Before reporting work as complete or committing code changes, ensure the code
quality checks pass. Each subproject's `AGENTS.md` lists the exact commands.
This applies even to trivial changes like type annotations.

Any code path not covered by the test suite must be executed manually before
committing. Do not rely on linting or type-checking alone as a substitute for
running changed behavior.

## Committing

All commit messages and PR titles must follow Conventional Commits:

```text
<type>(<scope>): <description>
```

Common types: `feat`, `fix`, `docs`, `chore`, `build`, `test`, `refactor`.

When work is associated with a Linear ticket, include the ticket ID in
parentheses at the end of the commit message and PR title, e.g.
`fix(ui): bust virtualizer cache on mode change (PRO-126)`.

Keep the subject line under 72 characters. When a commit resolves a ticket, use
the ticket title as the commit description unless the implementation materially
diverged from the ticket's scope.

Each subproject's `AGENTS.md` has additional commit guidance. Never bypass or
override commit signing. If signing fails, stop and report the problem rather
than working around it.
