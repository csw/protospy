# Maintaining the per-subproject Architecture TL;DR

Each subproject (`ui/`, `conformance/`, `flix/`) ships a TL;DR inline in its
`CLAUDE.md` under `## Architecture` → `### TL;DR`. It is the always-on
architectural summary that every agent sees by default; the subproject's
`ARCHITECTURE.md` is the deep doc agents fall back to when their change crosses
the trigger list in the parent `## Architecture` intro.

This file documents the prompt and rules for regenerating the TL;DR when it
drifts.

## When to regenerate

- Immediately after any change to the subproject's `ARCHITECTURE.md`, the
  `## Architecture` section of its `README.md`, or the code's stack / data
  flow / directory structure — in the same task, before reporting that change
  complete.
- When an agent footgun reveals a load-bearing invariant the TL;DR doesn't
  mention — even on the _first_ occurrence, if violating the invariant is
  silent or catastrophic. Don't wait for it to recur.

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
> If any of 2 or 3 disagree with the code, or with each other, **stop**. Surface the disagreement
> as a separate finding and wait for it to be resolved before touching the
> TL;DR — do not silently paper it over by re-deriving from whichever source
> happens to be convenient. Fix the deep doc (and `README.md` if relevant)
> first; then re-run this prompt to refresh the TL;DR.
>
> The TL;DR is an **always-on orientation, not a second copy of
> `ARCHITECTURE.md`**. It rides in `<SUB>/CLAUDE.md`, which loads into context
> before the agent reads any code and competes for attention with the task — so
> keep it to the minimum that lets an agent doing localized single-component work
> navigate the tree and avoid silently breaking an invariant. Push exhaustive
> data-flow and pipeline detail to `ARCHITECTURE.md` and **point to it** rather
> than reproducing it. See `docs/agents/prompt-authoring.md`, "Concision first."
>
> Target **~30–45 lines** of CLAUDE.md body. Cover, in this order:
>
> 1. **Stack.** Libraries and major versions (caret form, not exact pin) plus
>    any compiler / runtime caveats. Verify versions against the package
>    manifest.
> 2. **Architecture in brief.** A few sentences naming the spine end to end —
>    the key files/functions the data actually flows through — with an **explicit
>    pointer to `ARCHITECTURE.md`** (cite the section numbers) for the full data
>    flow, the type/taxonomy shapes, and any domain pipelines (the equivalent of
>    `ui/`'s "Bodies"). Do **not** reproduce the full end-to-end data-flow
>    paragraph or per-event/pipeline detail here — that is exactly what the
>    on-demand deep doc is for.
> 3. **Type / alias footguns**, one line — e.g. generated "do not edit" bindings,
>    a load-bearing path alias. Only the ones that bite; the full taxonomy lives
>    in `ARCHITECTURE.md`.
> 4. **Load-bearing details — don't break these.** Bullets for invariants whose
>    violation is silent or catastrophic. This is the **highest-value always-on
>    content** — keep it in full. Examples of the right shape: `ui/`'s
>    `window.__test_store` exposure, the persist key, reducer purity;
>    `conformance/`'s port-block allocation, `protospy-bypass` vs
>    `protospy-capture` equivalence, root-vs-tests `conftest.py` split;
>    `flix/`'s `TemplateResponse` argument order, `Settings` singleton, ES
>    major-version match. Add others only if they recur as agent footguns.
> 5. **Directory map.** A compact navigation aid: ≤ 1 line per principal
>    directory or top-level file, principal file names inline. This earns its
>    always-on place _only_ as a navigation aid for localized work — keep each
>    line genuinely terse; if it is drifting into a paragraph-per-directory copy
>    of `ARCHITECTURE.md`'s file map, cut it back or replace it with a one-line
>    pointer to that map.
>
> Rules:
>
> - Cite the names that appear in the code (function names, file paths, store
>   keys, localStorage keys, env vars, etc.). Do not paraphrase identifiers.
> - Do not invent details that are not in `ARCHITECTURE.md` or the code.
> - Do not reproduce content you can point to. A fact that lives in
>   `ARCHITECTURE.md` and isn't needed always-on belongs there with a pointer
>   here, not copied into both (it is then paid every session, and the copies
>   drift). The win is in cutting that duplication, not the load-bearing lessons.
> - Do not duplicate the "When you must read the full doc" trigger list —
>   that lives in the parent `## Architecture` intro paragraph, not inside
>   the TL;DR.
> - Output the change as an `Edit` against `<SUB>/CLAUDE.md`. Do not touch
>   `<SUB>/ARCHITECTURE.md` or `<SUB>/README.md` from this prompt — those
>   updates run through their own review.

## Length budget

\~30–45 lines of CLAUDE.md body, give or take. If it grows past 50, move detail
into `ARCHITECTURE.md` and point to it — the TL;DR shares the always-loaded
`CLAUDE.md` budget (target the whole file under ~200 lines; see
`docs/agents/prompt-authoring.md`, "Concision first"). If it shrinks so far that
the load-bearing invariants or the directory map drop out, it's too thin.
