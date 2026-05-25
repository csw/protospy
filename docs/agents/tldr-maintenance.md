# Maintaining the per-subproject Architecture TL;DR

Each subproject (`ui/`, `conformance/`, `flix/`) ships a TL;DR inline in its
`CLAUDE.md` under `## Architecture` → `### TL;DR`. It is the always-on
architectural summary that every agent sees by default; the subproject's
`ARCHITECTURE.md` is the deep doc agents fall back to when their change crosses
the trigger list in the parent `## Architecture` intro.

This file documents the prompt and rules for regenerating the TL;DR when it
drifts.

## When to regenerate

- After any change that updated the subproject's `ARCHITECTURE.md`, the
  `## Architecture` section of its `README.md`, or the code's stack / data
  flow / directory structure.
- When a recurring agent footgun reveals a load-bearing invariant the TL;DR
  doesn't mention.

The TL;DR is meant to ride along with the same change that motivated it —
don't ship an `ARCHITECTURE.md` edit without also re-deriving the TL;DR.

## The prompt

Substitute `<SUB>` with `ui`, `conformance`, or `flix`. Use it verbatim
otherwise.

> You are updating the `## Architecture` → `### TL;DR` section of
> `<SUB>/CLAUDE.md`. This TL;DR is the always-on architectural summary that
> every agent working in `<SUB>/` sees by default; `<SUB>/ARCHITECTURE.md` is
> the deep doc they fall back to for specific changes.
>
> Source of truth, in priority order:
>
> 1. The code itself (`<SUB>/src/` if present, plus the relevant config files
>    — `<SUB>/package.json`, `<SUB>/pyproject.toml`, `<SUB>/vite.config.ts`,
>    `<SUB>/vitest.config.ts`, `<SUB>/conftest.py`, etc., as applicable).
> 2. `<SUB>/ARCHITECTURE.md`.
> 3. The `## Architecture` section of `<SUB>/README.md`.
>
> If any of 2 or 3 disagree with the code, surface that as a separate finding
> — do not silently paper over it in the TL;DR. Fix the deep doc first, then
> re-derive.
>
> The TL;DR must cover, in this order, and stay under \~60 lines of
> CLAUDE.md body:
>
> 1. **Stack.** Libraries and major versions (caret form, not exact pin) plus
>    any compiler / runtime caveats. Verify versions against the package
>    manifest.
> 2. **Data flow.** One paragraph, end to end, naming the actual file/function
>    identifiers (not paraphrased).
> 3. **Types / taxonomies** (if the subproject has notable ones — type
>    aliases, proxy taxonomy, channel split, etc.).
> 4. **Domain pipelines** (the equivalent of `ui/`'s "Bodies" — wherever the
>    subproject has a non-obvious processing pipeline worth summarizing).
> 5. **Load-bearing details.** Bullets for invariants whose violation is
>    silent or catastrophic. Examples of the right shape: `ui/`'s
>    `window.__test_store` exposure, the persist key, reducer purity;
>    `conformance/`'s port-block allocation, `protospy-bypass` vs
>    `protospy-capture` equivalence, root-vs-tests `conftest.py` split;
>    `flix/`'s `TemplateResponse` argument order, `Settings` singleton, ES
>    major-version match. Add others only if they recur as agent footguns.
> 6. **Directory map.** One bullet per principal directory or top-level file.
>    ≤ 1 line each, names of the principal files inline.
>
> Rules:
>
> - Cite the names that appear in the code (function names, file paths, store
>   keys, localStorage keys, env vars, etc.). Do not paraphrase identifiers.
> - Do not invent details that are not in `ARCHITECTURE.md` or the code.
> - Do not duplicate the "When you must read the full doc" trigger list —
>   that lives in the parent `## Architecture` intro paragraph, not inside
>   the TL;DR.
> - Output the change as an `Edit` against `<SUB>/CLAUDE.md`. Do not touch
>   `<SUB>/ARCHITECTURE.md` or `<SUB>/README.md` from this prompt — those
>   updates run through their own review.

## Length budget

\~50–60 lines of CLAUDE.md body, give or take. If it grows past 70, look for
detail that belongs in the deep doc instead. If it shrinks below 40, you're
probably missing one of the six sections.
