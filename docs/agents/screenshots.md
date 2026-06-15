# PR screenshots

UI-touching tickets include before/after screenshots in the PR description so
reviewers can see what changed visually without checking out the branch.

## Trigger

Screenshots are taken when the ticket has a `UI` label:

```bash
linear issue view PRO-NNN --json \
  | jq -r '.labels.nodes[].name' \
  | grep -qi '^ui$' && echo yes || echo no
```

## upload-screenshot

`scripts/agents/upload-screenshot` uploads image files to S3 and prints one
Markdown image embed per file:

```
![filename](https://protospy-dev-data.s3.amazonaws.com/screenshots/pr-BRANCH/filename)
```

Usage:

```bash
# Upload a directory of images (non-recursive — only direct children)
scripts/agents/upload-screenshot .playwright-cli/before/

# Upload a single file
scripts/agents/upload-screenshot shot.png --branch feature/pro-225-my-change
```

The branch defaults to `git branch --show-current`. The bucket
(`protospy-dev-data`) and IAM credentials are provisioned in the container
environment.

Supported types: `.png`, `.jpg`, `.jpeg`, `.webp`.

## Before / after workflow

The `handle-ticket` skill wires this automatically for UI-touching tickets:

1. **Before (step 3a)** — before any implementation, start a dev server and
   use `playwright-cli` to screenshot the views/scenes identified in the ticket
   description. Save to `.playwright-cli/before/` and upload. Store the printed
   embed strings for the PR description.

2. **After (step 4)** — the qa-explorer subagent captures scoped screenshots
   during visual verify. Upload those and store the embed strings.

3. **PR description (step 6)** — append a `## Visual diff` section containing
   both sets of embed strings under `### Before` / `### After` headings.

## Scoping

Both sets of screenshots must be **scoped to the affected area** — the views
and scenes the ticket description identifies as changing. Do not capture the
full fixture matrix; a small, targeted set is more useful to reviewers than a
grid of unrelated pages.
