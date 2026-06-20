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
against a manifest of expected **filenames** (one per line; blank and `#` lines
ignored) and prints advisory warnings to stderr: a file not in the manifest is
likely a stale artifact, and a manifest entry not present was expected but never
captured. The warnings are for agent self-correction, not a gate — the upload
still proceeds. This is a **backstop for hand-assembled uploads**; the structural
before/after flow uses `capture-matrix` (below), which produces exactly the
spec'd set, so a stale/missing mismatch can't arise there.

```bash
scripts/agents/upload-screenshot some-dir/ \
  --branch "$(git branch --show-current)" --matrix expected-files.txt
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

The capture procedure itself — choosing the matrix, injecting scenes, activating
themes, waiting for content, naming files — lives in the **`protospy-screenshot`**
skill, which `handle-ticket` invokes for UI-labelled tickets. `capture-matrix`
and `capture-shot` (below) bake the mechanics in. This doc covers the surrounding
scripts and the PR-description wiring:

1. **Before (step 3a)** and **after (step 4)** — write one matrix spec
   (`scratch/matrix.txt`, `scene width theme` per line), then `capture-matrix
   --spec scratch/matrix.txt --out scratch/before` and `… --out scratch/after`,
   uploading each. The same spec drives both passes, so the sets pair by
   filename by construction — no manifest reconciliation needed.

2. **Screenshot comparison (step 4, always)** — run `screenshot-diff` on every
   UI ticket. Store the summary line for the PR description. If the expected vs.
   found result mismatch, surface immediately and do not push yet.

3. **Visual-diff report (step 4, whenever changes are found)** — if
   `screenshot-diff` finds differences, run `visual-diff-report` and store the
   URL for the PR description.

4. **PR description (step 6)** — always a `**Screenshot comparison:**` summary
   line. Add a `[Visual diff report](<URL>)` link when changes were found. Add a
   `> [!CAUTION]` block when the expected vs. found result mismatched.

## capture-matrix

`scripts/agents/capture-matrix` captures a whole matrix from a spec, so the
captured set *is* the spec — derived filenames, no stale artifacts, and
before/after passes that pair by construction:

```bash
scripts/agents/capture-matrix --spec scratch/matrix.txt --out scratch/before
```

The spec is one `scene width theme` cell per line (whitespace-separated; `#`
comments and blank lines ignored):

```
# scene            width  theme
exchanges-active   1280   dark
detail-panel       1280   dark
```

It cleans `--out`, then runs `capture-shot` once per cell. A malformed line or an
unknown scene fails the whole pass (no partial set). It prints each produced
filename to stdout. Running it twice with the same spec into `before`/`after`
guarantees identical filenames, so `screenshot-diff` pairs them. Needs a
`playwright-cli` session pointed at the running UI.

## capture-shot

`scripts/agents/capture-shot` is the single-shot primitive `capture-matrix` loops
over — it captures one canonical screenshot with the naming, theming, and
skeleton-wait rules baked in:

```bash
scripts/agents/capture-shot --scene exchanges-active --theme dark --width 1280 \
  --out scratch/before
# prints: exchanges-active-1280-dark.png
```

It resizes the viewport, applies the fixture scene via `window.__test_scenes`,
activates the theme with `set-theme`, waits for body content to settle (no
`aria-busy` region remains), then — as a final guard — confirms the live `.dark`
class still matches the filename's theme token before saving to
`{scene}-{width}-{theme}.png`. It needs a `playwright-cli` session already
pointed at the running UI. `--theme` is `light` or `dark` (an explicit shot
always has a definite theme). Use it directly for a one-off shot; use
`capture-matrix` for a before/after set. See the `protospy-screenshot` skill for
the full procedure.

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
