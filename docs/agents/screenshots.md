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

1. **Matrix (step 3a, before implementation)** — decide the minimal shot list:
   one width (default 1280) unless horizontal layout is affected; one theme
   (default dark) unless theme-specific styling is touched. Record the list in
   `scratch/matrix.txt` — one `{scene}-{width}-{theme}.png` filename per line.
   Start a dev server, screenshot each scene with `playwright-cli`, saving with
   the exact filenames from the manifest to `scratch/before/`, then upload.
   Store the printed embed strings for the PR description.

2. **After (step 4)** — the qa-explorer subagent receives the manifest filenames
   and saves screenshots with the same names to `scratch/after/`. Upload those
   and store the embed strings.

3. **Pixel self-check (step 4, refactor mode)** — when the ticket does not
   expect visual changes (refactor, internal rewiring), run:

   ```bash
   scripts/agents/screenshot-diff scratch/before/ scratch/after/
   ```

   The script pairs images by filename, computes pixel differences, and prints
   `"4/4 identical"` or `"2/4 differ: shot.png (0.3% changed)"`. Exit non-zero
   means unexpected visual regression — stop before pushing and investigate.
   Store the summary line for the PR description.

4. **PR description (step 6)** — append a `## Visual diff` section containing
   both sets of embed strings under `### Before` / `### After` headings, plus a
   `**Visual self-check:**` line if a pixel comparison was run.

## screenshot-diff

`scripts/agents/screenshot-diff` compares before and after directories
pixel-by-pixel:

```bash
scripts/agents/screenshot-diff scratch/before/ scratch/after/ [--threshold FRACTION] [--pixel-tolerance N]
```

Images are paired by filename. The script prints a one-line summary to stdout
and exits 0 (all within threshold) or 1 (at least one pair exceeds threshold).

- `--threshold` (default 0.001 = 0.1%) — max fraction of pixels allowed to
  differ per pair before exit non-zero.
- `--pixel-tolerance` (default 2) — per-channel RGB tolerance suppressing
  sub-pixel rendering noise; pixels differing by ≤ N in every channel count
  as identical.

## Scoping

Both sets of screenshots must be **scoped to the affected area** — the views
and scenes the ticket description identifies as changing. Do not capture the
full fixture matrix; a small, targeted set is more useful to reviewers than a
grid of unrelated pages.
