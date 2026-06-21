# Visual regression & UI screenshots

The protospy UI's pixel regression is **automated in CI** via
[reg-suit](https://github.com/reg-viz/reg-suit): every UI-touching PR — including
a **draft** — gets a before/after visual diff posted to the PR by the reg-viz
GitHub App, with baselines stored in S3 and keyed by git commit. Agents do
**not** capture or diff screenshots by hand for the PR.

This doc is the reference for that CI flow and for the surviving ad-hoc capture
scripts. The human-eye qualitative check and the ad-hoc capture **procedure**
live in the **`protospy-screenshot`** skill; `handle-ticket` wires both into the
ticket flow (step 4 qualitative check; steps 6/10 watch the CI diff).

## The CI flow at a glance

```
push to main (ui/** changed)         pull request incl. DRAFT (ui/**)
  capture-scenes.ts → .reg-actual      capture-scenes.ts → .reg-actual
  reg-suit sync-expected               reg-suit run:
  reg-suit compare                       sync-expected → compare → publish
  reg-suit publish                       → notify (GitHub App)
  (seed baseline @ commit sha;         ↳ expected = merge-base baseline (S3)
   no PR notification)                 ↳ publishes diff report under PR head sha
                                       ↳ App posts a PR comment (no commit status)
```

- **Workflow:** `.github/workflows/ui-visual-regression.yml`. It is a
  **dedicated** workflow, separate from `ui-ci.yml`, precisely so it runs on
  **draft** PRs — the rest of UI CI skips drafts, but the visual diff must be
  available throughout the review cycle, which iterates on a draft PR.
- **One renderer, both sides.** Baseline and PR "after" both render through
  `ui/scripts/capture-scenes.ts` driving the pinned `@playwright/test` Chromium
  against the static `preview` build — the same engine the browser suite uses —
  so a diff reflects a real UI change, not a renderer difference. (The
  `playwright-cli` daemon used for ad-hoc QA does not exist in CI and drives
  `pnpm dev`; it is deliberately not the regression renderer.)
- **Trigger:** a path filter scoped to **substantive UI changes** — the inputs
  that can actually move rendered pixels: `ui/src/**`, `ui/index.html`, the
  dependency set (`ui/package.json` / `ui/pnpm-lock.yaml`), `ui/vite.config.ts`,
  `ui/regconfig.json`, the capture renderer (`ui/scripts/capture-scenes*.ts` +
  `screenshot-helpers.ts`), `bindings/**`, and the workflow file itself. Docs,
  agent-instruction files, lint/TS config, the test harness, and the other
  `ui/scripts/` tools are deliberately excluded so a non-visual change doesn't
  burn a full matrix run. It runs on `push` to `main` and on `pull_request`
  (`opened`, `synchronize`, `reopened`, `ready_for_review`) with **no draft
  guard**.
- **Manual run:** a `workflow_dispatch` lets you run it on demand against any
  ref — `gh workflow run ui-visual-regression.yml --ref <branch>`, or pass a
  specific commit with `-f ref=<branch|tag|sha>` (a bare SHA is reattached to a
  throwaway branch so the keygen plugin is happy). A manual run always does the
  compare+notify path, never the baseline publish, so it can't overwrite the main
  baseline. (Dispatch only appears once the workflow is on the default branch.)

## What's captured

`capture-scenes.ts` enumerates the live fixture matrix
(`window.__test_scenes.list()`, the same `SCENES` as `browser/fixture-matrix.spec.ts`)
and captures, at width **1280**:

- **every scene in dark mode**, plus
- a curated **`LIGHT_SCENES`** subset in light mode (the surfaces whose light
  treatment matters — list view, inspector, a body view, command palette, help
  dialog). Extend that allowlist in the script to widen light coverage.

The fixture matrix stubs `/info` and injects store state, so capture needs **no
protospy backend and no cargo build** — only the built UI. Output filenames are
the canonical `{scene}-1280-{theme}.png`. Capture runs as a bounded concurrency
pool (default 6) against the static `preview` server, which handles concurrent
cold loads (the dev server serializes them).

Run it locally (e.g. to eyeball the captured set):

```bash
cd ui
pnpm capture:scenes --out .reg-actual            # builds, serves, captures, tears down
pnpm capture:scenes --out /tmp/shots --concurrency 8
pnpm capture:scenes --out /tmp/shots --base-url http://localhost:4173  # attach to a running preview
```

## reg-suit configuration

`ui/regconfig.json` wires three plugins:

- **`reg-keygen-git-hash-plugin`** — resolves the expected baseline by walking
  git history. It needs full history and an attached HEAD; the workflow checks
  out with `fetch-depth: 0` and `ref: ${{ github.head_ref }}` (the PR source
  branch) so it never sees a detached merge commit. (Running it locally works too
  because our worktrees use an attached branch, not detached HEAD — but the
  canonical run is CI.)
- **`reg-publish-s3-plugin`** — stores snapshots in `s3://protospy-dev-data`
  under `visual-regression/<commit-sha>/<file>`. `enableACL` is **false**: the
  bucket has Object Ownership set to *bucket-owner-enforced* (ACLs disabled, the
  modern S3 default), so a `PutObject` carrying any ACL is rejected with
  `AccessControlListNotSupported`. Public read is provided by the bucket
  **policy**, not per-object ACLs, so the plugin sends no ACL at all. It uses the
  default AWS SDK credential chain — the workflow provides `AWS_ACCESS_KEY_ID` and
  `AWS_SECRET_ACCESS_KEY` from GitHub Actions secrets, and `AWS_REGION` from a
  repo variable (the region is not sensitive).
- **`reg-notify-github-plugin`** — the reg-viz GitHub App. Posts the PR comment;
  no PAT needed. `setCommitStatus` is **false** so a visual diff never marks the
  PR's checks failing (a UI change is expected to move pixels — the comment is the
  record, not a gate). Its `clientId` (not a secret) is read from
  `$REG_NOTIFY_CLIENT_ID`, which the workflow sets from the
  `REG_NOTIFY_CLIENT_ID` repo variable.

`.reg/` (working dir) and `.reg-actual/` (capture output / `actualDir`) are
gitignored — they are transient CI artifacts.

## Reading the result

On a PR, the GitHub App posts a **comment** linking the reg-suit report (the
interactive diff carrying every shot, changes highlighted). It does **not** set a
commit status, so the diff never appears as a failing/pending check. Read the
comment after the workflow finishes (watch it with `scripts/agents/ci-watch`):

- **No changed items** → nothing visual moved; good for a refactor.
- **Changed/new/deleted items** → open the report. If the changes are
  **expected** (a feature or redesign), they're fine — the comment is the durable
  record reviewers see. If they're **unexpected** for the ticket, treat it as a
  finding: investigate before close-out and surface it to the user.

There is nothing to paste into the PR body by hand — the App comment is the
surface.

The workflow also writes a **job summary** (the new/changed/deleted/passed counts
and a link to the published report, from `scripts/reg-summary.mjs` parsing
reg-suit's `out.json`) to the Actions run page — handy on `push`-to-`main`
baseline runs, which have no PR to comment on.

## Baseline lifecycle

Baselines live in S3 keyed by commit. When a PR merges to `main`, the main run
republishes the baseline **including that PR's changes**, so the next PR compares
against it. A PR's own `publish` keys by its head sha, so it never clobbers the
main baseline.

**Bootstrapping:** the first main run after this lands seeds the initial
baselines. Until a baseline exists for a PR's merge-base, `sync-expected` finds
nothing and reg-suit reports the whole set as **new** (not a failure).

## Maintainer setup

These are outside an agent's reach and gate the live flow:

1. **AWS** — add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as GitHub
   Actions **secrets**, and `AWS_REGION` as a repo **variable** (the region is
   not sensitive). IAM needs `s3:GetObject`, `PutObject`, and `ListBucket` on
   `protospy-dev-data` — that's the whole set. No `DeleteObject` (snapshots are
   commit-keyed, only ever written or read), and no ACL actions
   (`GetObjectAcl` / `PutObjectAcl`): `enableACL` is false, so the plugin never
   touches object ACLs. The bucket must have **ACLs disabled** (Object Ownership =
   bucket-owner-enforced) and grant public read through its **bucket policy**, not
   per-object ACLs.
2. **GitHub App** — install <https://github.com/apps/reg-suit> on the repo, get
   the `clientId` from <https://reg-viz.github.io/gh-app/>, and set it as the
   `REG_NOTIFY_CLIENT_ID` repo **variable** (it is not a secret).
3. **Seed** — merge to `main` once so the first main run publishes baselines
   before PRs compare against them.

Until 1–2 are configured, the workflow's S3/notify steps fail; that is a setup
gap, not a regression in the change under review.

## Ad-hoc capture scripts

For human-driven shots — a one-off capture, exploratory-QA evidence, a state
reached by interaction — the **`protospy-screenshot`** skill drives these
`scripts/agents/` helpers. Each needs a `playwright-cli` session pointed at the
running UI.

### capture-shot

One canonical screenshot with naming, theming, and skeleton-wait baked in:

```bash
scripts/agents/capture-shot --scene exchanges-active --theme dark --width 1280 \
  --out scratch/shots
# prints: exchanges-active-1280-dark.png
```

It runs viewport resize, scene apply, theme activation + verify, content settle,
and the live-theme-vs-filename guard in a single `playwright-cli run-code` call
(then one `screenshot` call). The step JS is shared with `set-theme`/`wait-settled`
via `scripts/agents/_screenshot-js.sh`. `--theme` is `light` or `dark`. Exit 3
means the scene id is unknown to the running app; other non-zero is a hard
failure.

### scene-list

```bash
scripts/agents/scene-list   # one scene id per line, sorted
```

Dumps the running app's fixture scene ids via `window.__test_scenes.list()`.
Exits non-zero if the app doesn't expose the scene harness (a production build).

### set-theme

`scripts/agents/set-theme <light|dark|system>` activates a theme through the
next-themes test bridge (`window.__test_theme`) and verifies it took, so a shot
is never captured under the wrong theme. For an explicit `light`/`dark` target it
asserts the resolved `.dark` class; for `system` it verifies the preference only.

### wait-settled

`scripts/agents/wait-settled` waits for body content to finish loading before a
shot — the body-owning tabpanel (when present) and then every `aria-busy` region
clearing — so a shot captures content, not a skeleton. Run it **after** the
surface owning the body has mounted; running it before defeats the wait.

### upload-screenshot

`scripts/agents/upload-screenshot` uploads image files to S3 and prints one
Markdown image embed per file. Used by the review and bestiary workflows; use it
directly for ad-hoc or review uploads.

- **`--branch BRANCH`** — key `screenshots/pr-<slug>/<subdir>/<file>` (the
  directory name is the subdir, so sets don't collide).
- **`--prefix PREFIX`** — uses `<PREFIX>/<file>` verbatim, for non-PR content:

  ```bash
  scripts/agents/upload-screenshot <dir> --prefix "reviews/PRO-408-PR-123/round-1" --catalog
  ```

- **`--matrix PATH`** — checks the uploaded set against a manifest of expected
  filenames; advisory warnings for stale/missing files.
- **`--catalog`** — also uploads a self-contained HTML catalog to
  `<prefix>/index.html` (prints `Catalog: <url>`), parsing
  `{scene}-{width}-{theme}.ext` as review screenshots.

`--branch` and `--prefix` are mutually exclusive. Supported: `.png`, `.jpg`,
`.jpeg`, `.webp`.

## S3 access requirement

Both the reg-suit reports and `upload-screenshot` embeds
(`https://protospy-dev-data.s3.amazonaws.com/...`) only render in GitHub if the
objects are publicly readable. The bucket must keep its public-read policy; if
images show as broken links, check the bucket's public-access settings. The
bucket and IAM credentials are provisioned in the environment.
