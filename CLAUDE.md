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

**After pushing a branch or PR, watch its CI to completion** with `scripts/agents/ci-watch` driven by the Monitor tool — see [`docs/agents/ci.md`](docs/agents/ci.md). Do not poll the Checks API: the read-only token **cannot** read it (`gh pr checks` and `gh api .../check-runs` both return `403 Resource not accessible by personal access token`). Query CI through the Actions API by commit SHA instead (`gh run list --commit <sha>`), which is exactly what `ci-watch` does.

## Documentation

**Consult documentation before reasoning from first principles.** Use Context7 or a web search to look up:

- How to use a tool, library, or API — before reading source, before trial-and-error
- The conventional approach to a common problem — before designing a solution

Many problems you encounter are standard — e.g. dark mode persistence, form validation, auth flows, state hydration, error boundaries. Millions of applications have solved them with the same tools you're using. When you recognize a problem as standard, your first move is to look up how it's conventionally done — not to reason about it from your training data, which may be wrong or outdated.

You must consult documentation for any problem involving a library, framework, or API — even if you believe you know the answer. If you're about to propose an approach and you haven't consulted any external source, stop and look it up first. Your confidence that you know the answer is not evidence that you do.

## Specific guidelines

There are specific agent guidelines in `docs/agents/`; read them when working with the relevant kind of code.

- `docs/agents/implementation.md`: when writing code
- `docs/agents/python.md`: when working with Python, or writing an ad-hoc/one-off Python script (e.g. a verification or analysis helper)
- `docs/agents/testing.md`: when writing or maintaining tests
- `docs/agents/host-sandbox.md`: workarounds for running on the host macOS sandbox (gh-ro, worktree/git-prompt avoidance, `dangerouslyDisableSandbox` for git/Playwright/etc.) — **not applicable in the `cs` container; skip it there**
- `docs/agents/linear.md`: when working with Linear issues (e.g. `PRO-NNN` ticket references)
- `docs/agents/design.md`: when proposing a technical approach or making design decisions
- `docs/agents/dependencies.md`: when adding any dependency (packages, Actions, CDN scripts, Docker images, etc.)
- `docs/agents/ci.md`: when pushing to GitHub or investigating CI failures
- `docs/agents/quality-gates.md`: how the two-layer commit-time gates work (pre-commit framework + Claude hook)
- `docs/agents/worktrees.md`: worktree Claude config setup — what gets symlinked, why, and what agents must not do

Multiple guides often apply to a single task — read all that are relevant, not just the closest match.

## Visual design reviews

Use the `/design-review` skill for visual quality checks on the protospy UI. It covers
layout, typography, colour, hierarchy, component consistency, interaction design, and
responsive quality (at 1280/1440/1920px widths).

The skill is the general visual-quality bar; `docs/frontend-dod.md` is the **frontend
Definition of Done** that layers protospy-specific requirements on top (fixture-matrix
states, desktop-only widths, clipping affordances, pane bounds, no new console errors,
both themes). A UI change is done only when it passes both.

The **`visual-review` subagent** (`.claude/agents/visual-review.md`) is available for
periodic sweeps and ad-hoc invocation — it derives scope from the diff, walks the
**fixture matrix** (`ui/src/test/scenes.ts`, documented in `ui/docs/fixture-matrix.md`)
at the target widths in both themes, and returns a prioritized findings report. It drives
the browser through the **`playwright-cli`** skill. Invoke it directly via the Agent tool,
or use `/design-review` for an ad-hoc check. It is not run automatically by `handle-ticket`
— convention and code review catch most per-PR regressions; the visual sweep is most
valuable as a periodic tool (see PRO-242).

- Output goes to `~/obsidian/protospy/Claude/Reviews/design-review-YYYY-MM-DD.md`
- Accessibility scope: **keyboard/focus visual quality only** — axe violations are
  scanned (advisory) by `browser/a11y.spec.ts` and must not be duplicated here
- Use the `frontend-engineer` agent to take screenshots via the `playwright-cli` skill

The `frontend@jezweb-skills` plugin is also installed and provides `frontend:react-patterns`,
`frontend:shadcn-ui`, and `frontend:tailwind-theme-builder` skills for the `frontend-engineer`
agent. Use them when writing, reviewing, or adding components.

## Code-convention reviews

Visual review covers *rendered output*; **convention review** covers the *code* —
React/Tailwind/shadcn idioms that `/review` doesn't catch. The built-in `/review`
focuses on correctness bugs and CLAUDE.md compliance and deliberately filters out
style/quality findings not mandated by CLAUDE.md, so convention drift (no-op Tailwind
tokens, missing `cn()`, hand-rolled vs. shadcn primitives, hooks/effects footguns,
composition drift) slips through it.

For any PR whose diff touches `ui/src/**`, the `handle-ticket` skill runs a convention
review automatically (step 7b) via the **`convention-review` subagent**
(`.claude/agents/convention-review.md`): a read-only agent that scopes from the diff,
applies the three `frontend:*` skills above as review checklists, and returns a
prioritized findings report alongside the code review. It runs on UI-source diffs
regardless of the ticket's `UI` label. You can also spawn it ad-hoc via the Agent tool
for a convention pass outside `handle-ticket`.

The code and convention reviews run **independently and blind to each other**. When both
run, `handle-ticket` step 9 reconciles their findings via the **`review-synthesis`
subagent** (`.claude/agents/review-synthesis.md`): a read-only agent that reads the
review reports (not the raw code), deduplicates overlapping findings, links same-root-cause
findings across reviews ("one fix resolves both"), surfaces conflicting recommendations,
and re-ranks everything blocking vs. advisory on one scale. This keeps the reviews
separately tuned (and `/review` upstream-maintained) while making their *combined output*
coherent.

## Worktrees

Worktrees go in `.claude/worktrees/` at the project root — the location the `EnterWorktree` tool manages. Use `EnterWorktree` with path `.claude/worktrees/<branch-name>` — do not run `git worktree add` separately. `EnterWorktree` handles creation and entry atomically; splitting them defeats automatic cleanup on exit. (A `.worktrees` symlink → `.claude/worktrees` is kept as an alias for external tooling, and a legacy `.worktrees/<branch-name>` path is still accepted and normalized; prefer the canonical `.claude/worktrees/` form.)

Why `.claude/worktrees/` and not `.worktrees/`: the tool only lets you *switch* from one worktree into another when the target is a real directory under `.claude/worktrees/`, and it refuses a `.claude/worktrees` symlink. A `.worktrees/` location worked from the main checkout but broke worktree→worktree switching (and caused nested worktrees). See PRO-247.

When a worktree is created, a `post-checkout` hook automatically symlinks non-version-controlled Claude config (skills, hooks, agents, `settings.local.json`, `CLAUDE.local.md`) from the main repo into the worktree. **Do not manually copy or recreate these files in a worktree.** See `docs/agents/worktrees.md` for details.

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

These are examples. The underlying principle: delegate when the work is repetitive, the output is noisy, and only the conclusion matters to your task.

## Getting unstuck

If you've spent more than 5 minutes on the same problem without making progress — rummaging through files, trying the same approach repeatedly, or going in circles — stop and spawn a subagent for a fresh perspective. Brief it on what you've tried and what's not working. A second set of eyes on a stuck problem is almost always faster than continuing to iterate in the same direction.

## Code Quality Requirements

Before reporting a unit of work as complete or committing code changes, ensure the code quality checks pass. Read the relevant subproject's CLAUDE.md and run every quality check it lists. This applies even to trivial changes like type annotations.

**Any code path not covered by the test suite must be executed manually before committing.** For example, if you change a CLI `main()` function, start the server and confirm it runs. Do not rely on linting or type-checking alone as a substitute for actually running the code.

## Committing

All commit messages **and PR titles** must follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <description>
```

Common types: `feat`, `fix`, `docs`, `chore`, `build`, `test`, `refactor`. Scope is optional but use it where it helps (e.g. `flix`, `conformance`, `ui`).

PR titles matter because GitHub uses them as the default squash-merge commit message. A CI check enforces this — a non-conforming title will block the merge.

When work is associated with a Linear ticket, include the ticket ID in parentheses at the end of the commit message and PR title: `fix(ui): bust virtualizer cache on mode change (PRO-126)`. This links the commit to the issue in Linear.

**Keep the subject line under 72 characters** (the full line: type, scope, description, and ticket ID). This is the git convention — longer subjects get truncated in `git log --oneline`, GitHub's commit list, and notification emails. If you can't fit a meaningful description under 72, the description is too detailed for the subject line. Put implementation details ("via post-checkout hook", "using cargo-chef", "with React.memo") in the commit body, not the subject. The subject says *what changed*; the body says *how* and *why*.

**When a commit resolves a ticket, use the ticket title as the commit description** unless the implementation materially diverged from the ticket's scope. The ticket title was already written to be a good commit subject. Don't rephrase or elaborate on it.

Each subproject's CLAUDE.md has additional commit guidance (e.g. lockfile handling). Read it before committing subproject changes.

**Never bypass or override commit signing** (e.g. `-c commit.gpgsign=false`, `--no-gpg-sign`). If signing fails, stop and report the problem rather than working around it.

