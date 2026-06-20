# PR screenshots

UI-touching tickets include before/after screenshots in the PR description so
reviewers can see what changed visually without checking out the branch.

## Trigger

Screenshots are taken when the ticket has a `UI` label:

```bash
linear issues get PRO-NNN --output json \
  | jq -r '.labels[].name' \
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

**`--matrix PATH`** (optional, works with both modes) — checks the uploaded set
against a matrix manifest (one filename per line; blank and `#` lines ignored)
and prints advisory warnings to stderr: a file not in the manifest is likely a
stale artifact, and a manifest entry not present was expected but never
captured. The warnings are for agent self-correction, not a gate — the upload
still proceeds. The before/after PR flow passes `--matrix scratch/matrix.txt`.

```bash
scripts/agents/upload-screenshot scratch/after/ \
  --branch "$(git branch --show-current)" --matrix scratch/matrix.txt
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
   Clean `scratch/before/`, start a dev server, then for each scene **set the
   theme explicitly** with `scripts/agents/set-theme dark|light` before
   capturing — it drives the next-themes test bridge, waits for the theme to
   settle, and verifies it activated (the `-dark`/`-light` filename is a label,
   not the active theme). Save with the exact manifest filenames to
   `scratch/before/`, then upload with `--matrix scratch/matrix.txt`.

2. **After (step 4)** — clean `scratch/after/`; the qa-explorer subagent
   receives the manifest filenames, sets the theme with `set-theme` before each
   shot, and saves screenshots with the same names to `scratch/after/`. Upload
   those with `--matrix scratch/matrix.txt`.

3. **Screenshot comparison (step 4, always)** — run `screenshot-diff` on every
   UI ticket. Store the summary line for the PR description. If the expected vs.
   found result mismatch, surface immediately and do not push yet.

4. **Visual-diff report (step 4, whenever changes are found)** — if
   `screenshot-diff` finds differences, run `visual-diff-report` and store the
   URL for the PR description.

5. **PR description (step 6)** — always a `**Screenshot comparison:**` summary
   line. Add a `[Visual diff report](<URL>)` link when changes were found. Add a
   `> [!CAUTION]` block when the expected vs. found result mismatched.

## visual-diff-report

`scripts/agents/visual-diff-report` generates an interactive HTML visual-diff
report from matched before/after screenshot directories using
[reg-cli](https://github.com/reg-viz/reg-cli) (fetched via `npx`):

```bash
scripts/agents/visual-diff-report scratch/before/ scratch/after/ \
  --branch "$(git branch --show-current)"
```

Produces `scratch/visual-diff-report/` (HTML report + diff images), uploads
it to S3, and prints:

```
Report: https://protospy-dev-data.s3.amazonaws.com/screenshots/pr-<slug>/visual-diff-report/index.html
```

The report provides side-by-side, overlay, and pixel-diff views for every pair.

Options:

- `--output-dir DIR` — output directory (default: `scratch/visual-diff-report`)

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

## set-theme

`scripts/agents/set-theme <light|dark|system>` activates a theme through the
next-themes test bridge in the current `playwright-cli` session and verifies it
took, so a shot is never captured under the wrong theme:

```bash
scripts/agents/set-theme dark   # then capture a *-dark.png shot
```

Theme moved out of the Zustand store with the v2.3 next-themes swap (PRO-345):
`window.__test_theme` owns it, and both the bridge and the `.dark` class on
`<html>` are applied by React effects. The script waits for the bridge to mount,
sets the preference, waits for it to settle, then (for an explicit `light`/`dark`
target) asserts the resolved `.dark` class — exiting non-zero if the theme never
activates. For `system` it verifies the preference only, since the resolved
theme depends on the emulated color scheme. It needs a `playwright-cli` session
already pointed at the running UI.

## Scoping

Both sets of screenshots must be **scoped to the affected area** — the views
and scenes the ticket description identifies as changing. Do not capture the
full fixture matrix; a small, targeted set is more useful to reviewers than a
grid of unrelated pages.
