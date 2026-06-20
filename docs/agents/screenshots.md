# PR screenshots

UI-touching tickets include before/after screenshots in the PR description so
reviewers can see what changed visually without checking out the branch.

The capture **procedure** — the before/after passes and comparing — lives in the
**`protospy-screenshot`** skill, which `handle-ticket` follows when the branch
diff touches UI source. This doc is the reference for the underlying scripts (all
in `scripts/agents/`) and the PR-description wiring.

## Trigger

Screenshots are taken when the branch diff touches UI source:

```bash
git diff main...HEAD --name-only -- 'ui/src/**'
```

## What's captured

The flow captures the **whole** scene set for each app version and diffs them —
there is **no spec to author** and nothing to scope by hand. The before pass runs
against the **base app** (the merge-base with main), the after pass against HEAD;
each captures every scene its app exposes at 1280×dark. A view this branch adds
appears only in the after set, one it removes only in the before set, so
`screenshot-diff` derives new vs removed from which directory holds each file —
no annotation, no scene-list bookkeeping. `compare-screenshots` then surfaces only
the scenes that actually changed, so capturing everything doesn't flood the PR.

For a ticket that needs other dimensions (a non-default width, or light theme),
pass an explicit `--spec` (see [capture-matrix](#capture-matrix)) to the before
and after captures instead of the full set.

## capture-before-base

`capture-before-base` captures the **before** pass against the base app and
**caches it by base commit**:

```bash
scripts/agents/capture-before-base --out scratch/before
```

It resolves the merge-base (`--base-ref`, default `main`), checks it out into a
throwaway `git worktree`, runs `pnpm install` + a dev server there on a free port
(`--port` to override), points the current `playwright-cli` session at it, runs
`capture-matrix` (its full scene set) with **this branch's** scripts, and tears
the worktree and server down on exit. This script only *captures* — uploading and
diffing are `compare-screenshots`'s job.

The captured set is cached under
`${PROTOSPY_SCREENSHOT_CACHE:-~/.cache/protospy-screenshots}/before/<version>/<base-sha>/<dims>/`,
keyed by the base commit (the before set depends only on the base app's code), so
a later review cycle or a fresh session restores the PNGs instantly and skips the
worktree, install, server, and capture entirely. `--refresh-cache` forces a
recapture. `--spec <file>` captures explicit dimensions instead of the full set.

> **Note.** A cache entry is the base app rendered at one point in time; a
> browser-version bump between caching and a later `after` capture could introduce
> minor anti-aliasing differences. The pixel tolerance absorbs most of it; use
> `--refresh-cache` if a diff looks suspiciously noisy.

## capture-matrix

`capture-matrix` is the capture loop — the after pass uses it directly (no
upload; `compare-screenshots` handles uploads):

```bash
scripts/agents/capture-matrix --out scratch/after        # every scene the app exposes
scripts/agents/capture-matrix --spec scratch/matrix.txt --out scratch/after  # explicit cells
```

With no `--spec` it enumerates the running app's scenes (via `scene-list`) and
captures each at 1280×dark. `--spec` is an optional override: a file of
`scene width theme` cells (blank lines and full-line `#` comments ignored; every
other line exactly three fields), capturing exactly those instead of the full set.

It cleans `--out`, then runs `capture-shot` once per cell — derived filenames, no
stale artifacts. A cell whose scene is unknown to the running app (capture-shot
exit 3) is **skipped and reported**. Any other failure fails the whole run (no
partial set). Prints each produced filename to stdout, a summary plus any skips to
stderr. Needs a `playwright-cli` session pointed at the running UI.

## compare-screenshots

`compare-screenshots` produces the PR's `## Visual diff` section. It classifies
the pair with `screenshot-diff`, builds the interactive `visual-diff-report` when
anything changed, uploads **only** the scenes that changed, and prints a
ready-to-paste Markdown block:

```bash
scripts/agents/compare-screenshots scratch/before scratch/after \
  --branch "$(git branch --show-current)" --expected changed
```

```markdown
## Visual diff

**Screenshot comparison:** 2/45 differ: shot-1280-dark.png (0.3% changed)
[Visual diff report](https://protospy-dev-data.s3.amazonaws.com/...)

<details><summary>Changed scenes (2)</summary>
…embeds of the after image for changed/new scenes, the before image for removed…
</details>
```

The interactive report carries **every** shot (differences highlighted); the
inline embeds are limited to what changed, so a 45-scene set stays readable.
`--expected changed|unchanged` (optional) is the agent's judgment — a redesign
expects changes, a refactor does not. On a mismatch it prepends a `> [!CAUTION]`
block and **exits 3**, so the discrepancy stops the flow and still lands in the
PR. Exit 0 otherwise; 2 on a tooling error. `--threshold`/`--pixel-tolerance` are
forwarded to `screenshot-diff`.

## scene-list

`scene-list` dumps the running app's fixture scene ids (one per line, sorted) via
`window.__test_scenes.list()` — the single home for that incantation, used to
enumerate the full set to capture:

```bash
scripts/agents/scene-list   # one scene id per line
```

Exits non-zero if the app doesn't expose the scene harness (a production build, or
a base commit predating it). Needs a `playwright-cli` session pointed at the UI.

## capture-shot

`capture-shot` is the single-shot primitive `capture-matrix` loops over — one
canonical screenshot with the naming, theming, and skeleton-wait rules baked in:

```bash
scripts/agents/capture-shot --scene exchanges-active --theme dark --width 1280 \
  --out scratch/before
# prints: exchanges-active-1280-dark.png
```

It runs the whole shot — viewport resize, scene apply, theme activation + verify,
content settle, and the final live-theme-vs-filename guard — in a **single**
`playwright-cli run-code` call (then one `screenshot` call), so the per-shot cost
is a couple of process spawns rather than one per step. The step JS is shared with
`set-theme`/`wait-settled` via `scripts/agents/_screenshot-js.sh`. `--theme` is
`light` or `dark`. Exit 3 means the scene id is unknown to the running app (so a
matrix run skips it); other non-zero is a hard failure. Needs a `playwright-cli`
session pointed at the running UI.

## screenshot-diff

`scripts/agents/screenshot-diff` compares before and after directories
pixel-by-pixel:

```bash
scripts/agents/screenshot-diff scratch/before/ scratch/after/ \
  [--json] [--threshold FRACTION] [--pixel-tolerance N]
```

It classifies every file as **paired** (compared), **new** (after-only), or
**removed** (before-only). new/removed are expected outcomes and never fail the
run; only a paired pair over threshold does. Exits 0 when every compared pair is
within threshold, 1 when one exceeds it, 2 on bad arguments or when neither
directory has any images.

- `--json` — emit a machine-readable classification
  (`{identical, changed, new, removed, errors}`) instead of the one-line summary;
  `compare-screenshots` uses this to act on exactly the scenes that differ.
- `--threshold` (default 0.001 = 0.1%) — max fraction of pixels allowed to differ
  per pair before exit non-zero.
- `--pixel-tolerance` (default 2) — per-channel RGB tolerance suppressing
  sub-pixel rendering noise.

## visual-diff-report

`scripts/agents/visual-diff-report` generates an interactive HTML visual-diff
report from matched before/after directories using
[reg-cli](https://github.com/reg-viz/reg-cli) (fetched via `npx`), uploads it,
and prints the URL. reg-cli renders new and removed images as well as changed
pairs. `compare-screenshots` calls it; rarely run directly.

```bash
scripts/agents/visual-diff-report scratch/before/ scratch/after/ \
  --branch "$(git branch --show-current)"
# Report: https://protospy-dev-data.s3.amazonaws.com/screenshots/pr-<slug>/visual-diff-report/index.html
```

- `--output-dir DIR` — output directory (default: `scratch/visual-diff-report`).

## capture-pass

`capture-pass` captures a set and uploads it in one step — an **ad-hoc**
convenience (capture + `upload-screenshot`), not part of the before/after PR flow
(which uploads only what changed, via `compare-screenshots`):

```bash
scripts/agents/capture-pass --out scratch/shots --branch "$(git branch --show-current)"
```

The `--out` basename is the upload subdir. `--spec <file>` forwards to
`capture-matrix`; `--prefix PREFIX` instead of `--branch` for non-PR uploads. A
pass that captures nothing leaves an empty dir and uploads nothing. Needs a
`playwright-cli` session pointed at the running UI.

## upload-screenshot

`scripts/agents/upload-screenshot` uploads image files to S3 and prints one
Markdown image embed per file. `compare-screenshots` and `capture-pass` call it;
use it directly for ad-hoc or review uploads.

**`--branch BRANCH`** (PR uploads) — builds the key
`screenshots/pr-<slug>/<subdir>/<file>`; the directory name is the subdir so
different sets don't collide.

**`--prefix PREFIX`** (review and bestiary workflows) — uses `<PREFIX>/<file>`
verbatim; does not append the directory name. Use structured prefixes for non-PR
content:

```bash
scripts/agents/upload-screenshot <screenshots-dir> \
  --prefix "reviews/PRO-408-PR-123/round-1" --catalog
```

**`--matrix PATH`** (optional) — a backstop for hand-assembled uploads: checks the
uploaded set against a manifest of expected **filenames** (one per line) and
prints advisory warnings for stale (extra) or missing files.

**`--catalog`** (optional) — also generates and uploads a self-contained HTML
catalog page to `<prefix>/index.html` (prints `Catalog: <url>`). The viewer shows
screenshots by scene with independent theme and width selectors; it parses
`{scene}-{width}-{theme}.ext` as a review screenshot and anything else as a flat
catalog.

`--branch` and `--prefix` are mutually exclusive. Supported image types: `.png`,
`.jpg`, `.jpeg`, `.webp`.

## set-theme

`scripts/agents/set-theme <light|dark|system>` activates a theme through the
next-themes test bridge (`window.__test_theme`) in the current `playwright-cli`
session and verifies it took — so a shot is never captured under the wrong theme.
It waits for the bridge to mount, sets the preference, waits for it to settle,
then (for an explicit `light`/`dark` target) asserts the resolved `.dark` class,
exiting non-zero if the theme never activates. For `system` it verifies the
preference only. `capture-shot` shares its JS; use it directly for ad-hoc captures.

## wait-settled

`scripts/agents/wait-settled` waits for body content to finish loading before a
shot — it waits for the body-owning tabpanel (when present) and then for every
`aria-busy` region to clear, so a shot captures content, not a skeleton.
Best-effort (a stale skeleton is a soft defect). `capture-shot` shares its JS; in
an ad-hoc capture, run it **after** the surface owning the body has mounted —
running it before the skeleton appears defeats the wait.

## S3 access requirement

The embed URLs (`https://protospy-dev-data.s3.amazonaws.com/...`) only render as
images in GitHub PR descriptions if the objects are publicly readable. The bucket
must have a public-read policy. If images show as broken links, check the
bucket's public access settings. The bucket and IAM credentials are provisioned
in the container environment.
