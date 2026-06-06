# Design decisions

Whenever you are about to choose how to solve a problem using a library, framework, or tool — whether brainstorming, writing a spec, designing, or writing the code inline during implementation — follow this order before you commit to an approach:

1. **Recognize whether the problem is standard.** If it involves common tools (React, Zustand, Tailwind, Playwright, etc.) doing common things (persistence, theming, layout, testing patterns), it almost certainly has a conventional solution. Do this lookup even when the problem seems non-standard at first: most problems have a standard core with a project-specific wrinkle, so find the standard core first.

2. **Look up the conventional solution.** Use Context7 for library-specific patterns. Use a web search for ecosystem conventions. Do this before proposing or writing any approach — choosing an approach inline while coding counts as "proposing" one.

3. **Propose the conventional solution unless there's a specific reason not to.** If the standard approach doesn't fit, explain why and what's different about this case.

Do not:
- Design from first principles what a million applications have already solved
- Assume your training data accurately reflects current library behavior (APIs change, best practices evolve)
- Present a custom approach without first establishing what the standard one is
- Treat "I'm fairly sure I know how this works" as a substitute for checking

## When a directive fights the tools

A ticket, spec, or design-system rule that tells you to do something specific is not exempt from the checks above, and is not evidence its author already did the lookup. Treat a directive like any other proposed approach.

The signal that a directive may be wrong is **friction with the tools**: conforming requires a kludge — nesting components that don't compose, reimplementing behavior a primitive already provides, overriding a class that won't take effect, or writing a paragraph to justify an awkward fit. That struggle is evidence, not a problem to engineer around.

When you hit it:

1. Stop before building the workaround.
2. Verify the actual behavior of the primitive/library against its docs (Context7 / official docs).
3. If the docs contradict the directive, raise the question instead of implementing the kludge — state what the directive assumes, what the tool actually does, and the clean alternative.

This is narrow on purpose. It fires only when you're already fighting the implementation; well-specified work won't trip it.
