# Design decisions

When proposing a technical approach — during brainstorming, spec writing, or design — follow this order:

1. **Recognize whether the problem is standard.** If it involves common tools (React, Zustand, Tailwind, Playwright, etc.) doing common things (persistence, theming, layout, testing patterns), it almost certainly has a conventional solution.

2. **Look up the conventional solution.** Use Context7 for library-specific patterns. Use a web search for ecosystem conventions. Do this before proposing any approach.

3. **Propose the conventional solution unless there's a specific reason not to.** If the standard approach doesn't fit, explain why and what's different about this case.

Do not:
- Design from first principles what a million applications have already solved
- Assume your training data accurately reflects current library behavior (APIs change, best practices evolve)
- Present a custom approach without first establishing what the standard one is
- Treat "I'm fairly sure I know how this works" as a substitute for checking
