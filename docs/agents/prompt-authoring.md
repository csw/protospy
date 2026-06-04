# Writing agent prompts and skills

When writing or modifying agent-facing text — CLAUDE.md content, agent
definitions, skill definitions, command files, `docs/agents/` guides —
follow these principles. They're derived from empirical observation of how
agents (particularly literal-following models like Opus 4.7+) actually
interpret instructions in this project.

## Frame instructions as obligations, not self-checks

A literal model may not perform a self-check that isn't framed as a
requirement.

Bad: "If you're about to propose an approach without consulting docs, stop."
(Voluntary — the agent decides whether to apply this.)

Good: "You must consult documentation before proposing any approach."
(Obligation — no judgment call about whether it applies.)

## Mark example lists as illustrative, not exhaustive

A literal model treats an unqualified list as the complete set. If the
list is meant to be illustrative, say so.

Bad: "Standard problems: dark mode persistence, form validation, auth
flows, state hydration, error boundaries."
(Reads as: these five things are the standard problems.)

Good: "Standard problems — e.g. dark mode persistence, form validation,
auth flows, state hydration, error boundaries."
(Reads as: these are examples of a broader category.)

When a list is genuinely exhaustive, that's fine — just make sure it
actually is.

## Use concrete triggers, not judgment calls

Instructions that require the agent to judge when they apply get
interpreted narrowly by literal models and inconsistently by
generalizing ones.

Bad: "Read the relevant docs before starting."
(Which docs? "Relevant" requires the same judgment the instruction is
trying to replace.)

Good: "Read `ui/CLAUDE.md` and `ui/ARCHITECTURE.md` before starting any
UI task."
(No judgment needed — the trigger is clear and the action is specific.)

When you can't enumerate the targets, provide a concrete trigger and a
search strategy: "Before using any library you find in the code, look up
its documentation via Context7."

## State the general principle, not just the examples

Complement concrete examples with the underlying principle. A literal
model follows the examples exactly; a generalizing model follows the
principle. Providing both covers both failure modes.

Bad:
```
Delegate when the work looks like:
- "Which process is listening on port X?"
- Sweeping logs for a needle
- Repeated probing where only the conclusion matters
```
(A literal model delegates only for these three patterns.)

Good:
```
Delegate when the work looks like:
- "Which process is listening on port X?"
- Sweeping logs for a needle
- Repeated probing where only the conclusion matters

These are examples. The underlying principle: delegate when the work is
repetitive, the output is noisy, and only the conclusion matters.
```

## Tell agents to read all applicable guides, not just one

A list of guides organized by topic implies "pick the one that matches."
Multiple guides often apply to a single task — say so explicitly.

If a Python task also adds a dependency and touches CI config, the agent
needs `python.md`, `dependencies.md`, and `ci.md`. Without explicit
instruction, a literal model reads only the closest match.

## Don't rely on passive statements as directives

Stating a fact ("Each subproject's CLAUDE.md lists the quality checks")
is not the same as issuing a directive ("Read the subproject's CLAUDE.md
and run every quality check it lists"). A literal model notes the fact
without acting on it.

Check every instruction: does it tell the agent to *do* something, or
does it describe how the world is and hope the agent infers what to do?

## Explain why, but don't substitute explanation for instruction

Explaining the purpose behind an instruction helps agents apply it
correctly in edge cases. But explanation alone isn't enough — the agent
also needs the concrete directive.

Bad: "Test failures during CI are almost always caused by the change,
not by flaky infrastructure."
(Explains a fact but doesn't say what to do about it.)

Good: "When tests fail, investigate the failure as caused by your change
until you have concrete evidence otherwise. Test failures during CI are
almost always caused by the change, not by flaky infrastructure."
(Directive first, explanation second.)

## Preload load-bearing skills; don't rely on lazy-load triggers

If an agent's core job depends on a skill, preload it via the agent's `skills:`
frontmatter rather than relying on the skill's lazy-load trigger to fire. Skill
trigger descriptions are tuned for *discovery* ("when adding a shadcn
component…") — the moment a user first reaches for the skill — not for *standing
use*, where the agent already knows it needs the skill on every task. A literal
model reads a discovery-tuned trigger, decides "I'm not in that situation," and
proceeds without the skill.

This has bitten repeatedly: `frontend:shadcn-ui` didn't fire during routine UI
work, so an agent hand-rolled a button instead of using the existing shadcn
`<Button>` (PRO-281); the session-start snapshot subagent never loaded
`linear-cli`, guessed the CLI, and returned a wrong count (PRO-290); the
`design-review` render step was conditional, so a literal model "reviewed" from
source without rendering (PRO-227). The fix each time was preloading via
frontmatter — applied to `frontend-engineer`, `convention-review`, and
`pm-helper`.

The trigger: when writing or auditing an agent definition, ask of each skill the
agent depends on — does its core job require this skill on every task, or only
on discovery? If every task, preload it via frontmatter. Where lazy-load is
intentional (the skill is genuinely situational), say so in a comment so a later
audit doesn't "fix" it.

## Test instructions by imagining the most literal reading

Before finalizing any instruction, ask: if the agent does exactly what
these words say and nothing more, does it do the right thing? If the
instruction only works when the agent also infers something unstated,
make the unstated thing explicit.

This is the single most useful habit for writing prompts that work
across model versions. Models that generalize freely will still follow
explicit instructions correctly; models that follow literally will not
fill in the gaps.
