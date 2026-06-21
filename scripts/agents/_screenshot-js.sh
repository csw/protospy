#!/usr/bin/env bash
#
# Shared JavaScript snippets for the screenshot-capture scripts, so the per-step
# logic (harness wait, scene apply, theme activation, content settle, theme guard)
# lives in ONE place — identical whether run as a single merged `playwright-cli`
# call (`capture-shot`, which spawns one process per shot instead of one per step)
# or as a standalone helper (`set-theme`, `wait-settled`).
#
# Each function prints JS *statements* that operate on a playwright `page` handle
# already in scope. `capture-shot` concatenates several into one
# `async page => { … }` body; the standalone helpers wrap a single function's
# output in their own `async page => { … }`. Because the snippets become the body
# of the enclosing function, a `return` inside one returns from that function —
# which the apply/guard steps use to surface a structured `{ stage }` result.
#
# Source this file; do not execute it. (Underscore prefix = not a command.)

# A JS string literal for a shell value, properly quoted and escaped via jq, so a
# scene id or theme with an odd character can't break the snippet or inject code.
_js_str() { jq -nc --arg v "$1" '$v'; }

# Wait for the scene harness to mount — `playwright-cli open` returns before the
# SPA boots, so an immediate eval can race the install of `window.__test_scenes`.
# Throws on timeout: a harness that never appears (production build, app crash) is
# a hard error, distinct from a known-good app that merely lacks one scene.
js_wait_harness() {
  cat <<'JS'
await page.waitForFunction(
  () => !!(window.__test_scenes && typeof window.__test_scenes.applyAndSettle === 'function'),
  { timeout: 15000 },
);
JS
}

# Apply a fixture scene and settle. applyAndSettle resets the store, applies the
# cell, waits for React, and resolves false for an unknown id — for which this
# returns { stage: 'unknown-scene' } from the enclosing function (so a matrix run
# can SKIP a scene this app version lacks) rather than throwing, which is reserved
# for hard failures.
js_apply_scene() { # $1 = scene id
  printf 'if (!(await page.evaluate(id => window.__test_scenes.applyAndSettle(id), %s))) {\n  return { stage: "unknown-scene" };\n}\n' "$(_js_str "$1")"
}

# Activate the theme through the next-themes test bridge and verify it took. The
# bridge (window.__test_theme) and the `.dark` class on <html> are applied by
# React effects, so this waits for the bridge to mount, sets the preference, waits
# for it to settle, then — for an explicit light/dark target — asserts the
# resolved `.dark` class. Throws if the bridge never mounts, the preference never
# settles, or the resolved class disagrees, so a shot is never captured under the
# wrong theme. (For 'system' the resolved theme depends on the emulated color
# scheme, so only the preference is verified.)
js_set_theme() { # $1 = theme
  local t; t="$(_js_str "$1")"
  cat <<JS
await page.waitForFunction(() => window.__test_theme != null, { timeout: 10000 });
await page.evaluate(t => window.__test_theme.setTheme(t), $t);
await page.waitForFunction(t => window.__test_theme.theme === t, $t, { timeout: 10000 });
if ($t !== "system") {
  const __isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  if (__isDark !== ($t === "dark")) throw new Error("resolved theme is not " + $t);
}
JS
}

# Wait for body content to finish decoding before a shot — the body pane decodes
# asynchronously (JSON in a Web Worker, compressed bodies via WASM, images as
# <img>) and marks itself aria-busy while in flight (design-system §4.5). Order
# matters: the aria-busy detach wait resolves instantly if nothing is busy *yet*,
# so wait for the body-owning tabpanel to be visible first. Best-effort — a stale
# skeleton is a soft defect, never a hard failure; never throws.
js_wait_settled() {
  cat <<'JS'
const __panel = page.getByRole('tabpanel').first();
if (await __panel.count()) {
  await __panel.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
}
await page.locator('[aria-busy="true"]').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
JS
}

# Final guard before the file write: confirm the live theme still matches the
# target, so a shot's pixels can never disagree with its filename's theme token
# even if a future step is inserted between theme activation and capture. Returns
# { stage: 'theme-mismatch' } from the enclosing function on disagreement.
js_theme_guard() { # $1 = theme
  local t; t="$(_js_str "$1")"
  cat <<JS
{
  const __isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  if (__isDark !== ($t === "dark")) return { stage: "theme-mismatch" };
}
JS
}
