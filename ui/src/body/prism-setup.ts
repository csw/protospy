/**
 * Side-effect module: must be imported *before* `prismjs` so Prism reads this
 * config when it initializes.
 *
 * Prism, when loaded in a Worker (no `document`), registers its own `message`
 * listener that `JSON.parse()`s every incoming message and treats it as a
 * highlight request. That clobbers our own Worker protocol (we post structured
 * objects, not JSON strings), throwing `"[object Object]" is not valid JSON`.
 * `disableWorkerMessageHandler` is Prism's documented opt-out; `manual` stops
 * the on-load auto-highlight (irrelevant off the main thread, set for safety).
 * Both are read from `globalThis.Prism` at Prism init time.
 */

// `@types/prismjs` declares `Prism` as an ambient global with the full
// namespace type, so a direct `globalThis.Prism = {…}` would fail to typecheck
// against that shape. `Object.assign` installs the partial config object Prism
// reads at init without fighting the ambient typing.
Object.assign(globalThis, {
  Prism: { disableWorkerMessageHandler: true, manual: true },
});
