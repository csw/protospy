---
name: design-review
description: "Review the protospy UI for visual design quality — layout, typography, spacing, colour, hierarchy, component consistency, interaction patterns, and responsive behaviour. Produces a findings report in the Obsidian Reviews directory. Triggers: 'design review', 'does this look good', 'review the design', 'check the layout', 'is this polished', 'visual review', 'design audit', 'make it look better', 'it looks off'."
compatibility: claude-code-only
---

# Design Review — protospy UI

Review the protospy UI for visual design quality. This is not a UX audit (usability, workflow,
friction) — this checks whether the design is **professional, consistent, and polished**.

The goal: would a design-conscious person look at this and think "this is well made" or "this
looks like a developer designed it"?

## Procedure

This review is of the **rendered, running app** — not its source. Do not assess from reading
component code or from memory; every finding must point to a real screenshot you captured this
session. Work through these steps in order before assessing anything:

1. **Start the dev server.** Invoke the `/run` skill to start the UI dev server (use a
   non-default port) and note the URL. If it will not start, or no browser is available, **stop
   and say so** — do not fall back to reviewing source code or reasoning about what the UI
   probably looks like.
2. **Drive the browser** via the `playwright-cli` skill (`open` → `goto <url>` → `screenshot`).
3. **Capture before you judge.** For the primary surfaces (the exchange list and the inspector)
   and the commonly-missed states (empty, loading, error), at each of the three widths
   **1280 / 1440 / 1920** in **both** light and dark themes, take a screenshot *first*. Use
   `playwright-cli resize` to change width and toggle the theme between captures. Light and dark
   are both required — most issues appear in one but not the other.
4. **Assess each screenshot** against the checks below. If you did not capture a state, you have
   not reviewed it — go back and capture it. Do not report a width or theme as "tested" that you
   did not actually screenshot.

The systematic per-scene sweep of the full fixture matrix is the `visual-review` subagent's job;
this skill reviews the live app's primary surfaces and states. Where a check needs a state the
live app won't show on its own, inject the relevant scene from `ui/src/test/scenes.ts`.

## What to Check

### 1. Layout and Spacing

| Check | Good | Bad |
|-------|------|-----|
| **Consistent spacing** | Same gap between all cards in a grid, same padding in all sections | Some cards have 16px gap, others 24px. Header padding differs from body |
| **Alignment** | Left edges of content align vertically across sections | Heading starts at one indent, body text at another, cards at a third |
| **Breathing room** | Generous whitespace around content, elements don't feel cramped | Text touching container edges, buttons crowded against inputs |
| **Grid discipline** | Content follows a clear column grid | Elements placed freely, no underlying structure |
| **Responsive proportions** | Sidebar/content ratio looks intentional at every width | Sidebar takes 50% on tablet, content is squeezed |
| **Vertical rhythm** | Consistent vertical spacing pattern (e.g. 8px/16px/24px/32px scale) | Random spacing: 13px here, 27px there, 8px somewhere else |

### 2. Typography

| Check | Good | Bad |
|-------|------|-----|
| **Hierarchy** | Clear visual difference between heading → subheading → body | Headings and body text look the same size/weight |
| **Line length** | Body text 50–75 characters per line | Full-width text running 150+ characters — hard to read |
| **Line height** | Body text 1.5–1.7, headings 1.1–1.3 | Cramped text or excessive line height |
| **Font sizes** | Consistent scale (e.g. 14/16/20/24/32) | Random sizes: 15px, 17px, 22px with no relationship |
| **Weight usage** | Regular for body, medium for labels, semibold for headings, bold sparingly | Everything bold, or everything regular with no hierarchy |
| **Truncation** | Long text truncates with ellipsis, title attribute shows full text | Text overflows container, wraps awkwardly, or is cut off without ellipsis |

### 3. Colour and Contrast

| Check | Good | Bad |
|-------|------|-----|
| **Semantic colour** | Using design tokens (`bg-bg`, `text-ink`, `text-m-get`) | Raw Tailwind colours (`bg-blue-500`, `text-gray-300`) |
| **Contrast ratio** | Text meets WCAG AA (4.5:1 for body, 3:1 for large text) | Light grey text on white, or dark text on dark backgrounds |
| **Colour consistency** | Same blue means the same thing everywhere | Blue means "clickable" in one place and "informational" in another |
| **Dark mode** | All elements visible, borders defined, no invisible text | Elements disappear, text becomes unreadable, images look wrong |
| **Status colours** | Green=success, yellow=warning, red=error consistently | Green used for both success and "active" with different meanings |
| **Colour overuse** | 2–3 colours + neutrals | Rainbow of colours with no clear hierarchy |

### 4. Visual Hierarchy

| Check | Good | Bad |
|-------|------|-----|
| **Primary action** | One clear CTA per page, visually dominant | Three equally styled buttons competing for attention |
| **Squint test** | Squinting at the page, the most important element stands out | Everything is the same visual weight — nothing draws the eye |
| **Progressive disclosure** | Most important info visible, details available on interaction | Everything shown at once — overwhelming |
| **Grouping** | Related items are visually grouped (proximity, borders, backgrounds) | Related items scattered, unrelated items touching |
| **Negative space** | Intentional empty space that frames content | Empty space that looks accidental (uneven, trapped white space) |

### 5. Component Consistency

| Check | Good | Bad |
|-------|------|-----|
| **Button styles** | One primary style, one secondary, one destructive — used consistently | 5 different button styles across the app |
| **Badge styles** | Method badges (GET/POST/etc.) use consistent sizing, font, and radius | Some badges rounded, some sharp; different font sizes |
| **Form inputs** | All inputs same height, same border style, same focus ring | Mix of heights, border styles, focus behaviours |
| **Icon style** | Lucide icons, consistent size and stroke | Different sizes, some filled some outlined |
| **Border radius** | Consistent radius scale (e.g. 4px inputs, 8px cards) | Random radius values: 3px, 7px, 10px |
| **Shadow** | One or two shadow levels used consistently | Every component has a different shadow depth |

### 6. Interaction Design

| Check | Good | Bad |
|-------|------|-----|
| **Hover states** | Buttons, links, and clickable rows change on hover | No hover feedback — user unsure what's clickable |
| **Focus states** | Keyboard focus visible on all interactive elements | Focus ring missing or invisible against background |
| **Active states** | Selected exchange row, active tab — clearly distinguished from inactive | Active item looks the same as inactive |
| **Transitions** | Subtle transitions on hover/focus (150–200ms ease) | No transitions (jarring) or slow transitions (laggy) |
| **Loading indicators** | Spinner or skeleton during connection/loading | Content pops in without warning, layout shifts |
| **Disabled states** | Disabled elements are visually muted, cursor changes | Disabled buttons look clickable, no cursor change |

### 7. Responsive Quality

Check at three target widths: **1280px**, **1440px**, and **1920px**.

| Check | Good | Bad |
|-------|------|-----|
| **List/inspector split** | Resizable split looks intentional at all widths | Split too narrow or too wide at default ratio |
| **Table mode** | Columns sized appropriately, no overflow | Columns too wide or squished |
| **Long URIs** | Truncated with ellipsis, not overflowing | URI overflows the cell, pushing other columns |
| **Status bar** | Readable and not cramped | Items overlap or disappear at certain widths |

## Accessibility — Keyboard and Focus Only

**This review covers keyboard/focus visual quality only.** ARIA semantics, screen reader
labels, landmark structure, and role correctness are handled by the `@axe-core/playwright`
hard-fail gate in `browser/a11y.spec.ts` — do not duplicate that work here.

What to check in this review:
- Focus rings: are they visible on all interactive elements (buttons, tabs, inputs, rows)?
- Focus contrast: does the focus ring show up in both light and dark mode?
- Focus order: does Tab move through the page in a logical sequence?
- Skip navigation: for dense lists, can keyboard users reach the inspector without tabbing through every row?

Rank keyboard/focus issues with the **Severity Guide below**, not at a fixed level: a missing or
invisible focus ring is **High** (the UI is broken for keyboard users), a confusing focus order or
missing skip-nav is **Medium**, and minor focus-contrast polish is **Low**. Do **not** report axe
failures or WCAG violations unrelated to visible focus — those belong in the test suite.

## Severity Guide

| Level | Meaning | Example |
|-------|---------|---------|
| **High** | Looks broken or unprofessional | Invisible text in dark mode, buttons different heights inline, invisible focus ring |
| **Medium** | Looks unpolished | Inconsistent spacing, mixed icon styles, truncation without ellipsis |
| **Low** | Nitpick | 1–2px alignment, slightly different border-radius, shadow too strong |

## Output

Write findings to `~/obsidian/protospy/Claude/Reviews/design-review-YYYY-MM-DD.md`
(substitute today's date in `YYYY-MM-DD` format). If a review for today already exists, suffix the
filename (`-2`, `-3`, …) rather than overwriting the earlier one:

```markdown
# Design Review: protospy UI
**Date**: YYYY-MM-DD
**Widths tested**: <the widths you actually captured — e.g. 1280px, 1440px, 1920px>
**Modes tested**: <the themes you actually captured — e.g. light, dark>

## Overall Impression
[1–2 sentences — professional / unpolished / inconsistent / clean]

## Findings

### High
- **[issue]** at [component/view] — [what's wrong] → [fix]

### Medium
- **[issue]** at [component/view] — [what's wrong] → [fix]

### Low
- **[issue]** — [description]

## What Looks Good
[Patterns that are well-executed and should be preserved]

## Top 3 Fixes
1. [highest visual impact change]
2. [second]
3. [third]
```

Embed the screenshots you captured in the Procedure for any finding that is visual (most of
them). Save screenshots to `~/obsidian/protospy/Claude/screenshots/` and link them with relative
paths. The `Widths tested` and `Modes tested` lines must reflect what you actually captured — not
the full target set if you only got partway.

## Tips

- The squint test is the fastest way to find hierarchy problems
- Component inconsistency is the most common issue in dev-built UIs
- "Looks off" usually means spacing — check margins and padding first
- The exchange list and inspector are the primary surfaces; always review them first
