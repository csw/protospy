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
Markdown image embed per file. Two path-building modes:

**`--branch BRANCH`** (PR before/after workflow) — builds the key as
`screenshots/pr-<slug>/<subdir>/<file>`. The directory name is appended as
a subdir so `before/` and `after/` directories don't collide.

```bash
scripts/agents/upload-screenshot scratch/before/ \
  --branch "$(git branch --show-current)"
scripts/agents/upload-screenshot shot.png --branch feature/pro-225-my-change
```

**`--prefix PREFIX`** (review and bestiary workflows) — uses `<PREFIX>/<file>`
as the key verbatim; does not append the directory name. Use structured
prefixes for non-PR content:

```bash
# visual-review / design-sweep screenshots
scripts/agents/upload-screenshot <screenshots-dir> \
  --prefix "reviews/PRO-408-PR-123/round-1" --catalog

# bestiary run
scripts/agents/upload-screenshot <bestiary-dir> \
  --prefix "bestiary/2026-06-15" --catalog
```

**`--catalog`** (optional, works with both modes) — after uploading images,
generates a self-contained HTML catalog page and uploads it to
`<prefix>/index.html`. Prints one extra line:

```
Catalog: https://protospy-dev-data.s3.amazonaws.com/<prefix>/index.html
```

The catalog viewer shows screenshots by scene (left panel), with independent
theme (light/dark) and width (1280/1440/1920) selectors. It defaults to dark
theme at 1440px. It parses filenames automatically: `{scene}-{width}-{theme}.ext`
is treated as a review screenshot; anything else shows as a flat catalog.

`--branch` and `--prefix` are mutually exclusive. The bucket
(`protospy-dev-data`) and IAM credentials are provisioned in the container
environment.

Supported image types: `.png`, `.jpg`, `.jpeg`, `.webp`.

## S3 access requirement

The embed URLs (`https://protospy-dev-data.s3.amazonaws.com/...`) only render
as images in GitHub PR descriptions if the objects are publicly readable. The
bucket must be configured with a public-read policy (or per-object ACL) for
the embeds to work. If images show as broken links in a PR, check the bucket's
public access settings.

## Before / after workflow

The `handle-ticket` skill wires this automatically for UI-touching tickets:

1. **Before (step 3a)** — before any implementation, start a dev server on a
   free port and use `playwright-cli` to screenshot the views/scenes identified
   in the ticket description. Save to `scratch/before/` and upload.
   Store the printed embed strings for the PR description.

2. **After (step 4)** — the qa-explorer subagent saves scoped screenshots to
   `scratch/after/`. Upload those and store the embed strings.

3. **PR description (step 6)** — append a `## Visual diff` section containing
   both sets of embed strings under `### Before` / `### After` headings.

## Scoping

Both sets of screenshots must be **scoped to the affected area** — the views
and scenes the ticket description identifies as changing. Do not capture the
full fixture matrix; a small, targeted set is more useful to reviewers than a
grid of unrelated pages.
