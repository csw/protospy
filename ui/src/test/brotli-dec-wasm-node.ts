/**
 * Node-compatible initializer for brotli-dec-wasm.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * brotli-dec-wasm's default export (`index.js`) calls
 *   fetch(new URL('./pkg/brotli_dec_wasm_bg.wasm', import.meta.url))
 * to load its WASM binary. Node 22's fetch() (undici) does not support
 * file:// URLs, so this fails with "TypeError: fetch failed / not implemented".
 *
 * The package also exports `initSync()` which accepts a plain BufferSource,
 * so we can load the WASM with readFileSync() and initialize synchronously.
 * That works fine in Node — and this file does exactly that.
 *
 * HOW IT IS WIRED UP
 * ------------------
 * vitest.config.ts aliases `brotli-dec-wasm` → this file for the "node"
 * Vitest project only. decode.ts's dynamic `import('brotli-dec-wasm')` is
 * therefore redirected here when running unit tests.
 *
 * Vite (production browser build) and Playwright browser tests use the real
 * package, which loads WASM via fetch() in Chromium — no alias applies there.
 *
 * EXPORTED API
 * ------------
 * Matches brotli-dec-wasm's real default export: a Promise resolving to an
 * object with a decompress(data: Uint8Array) → Uint8Array function.
 * decode.ts consumes it as: `const brotli = await mod.default; brotli.decompress(data)`
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initSync, decompress } from "brotli-dec-wasm/web";

// Locate the WASM binary. import.meta.resolve() returns the URL of the
// package's main entry (index.js); path.dirname() gives the package root;
// then we navigate to the pre-built WASM in pkg/.
const pkgDir = path.dirname(
  fileURLToPath(import.meta.resolve("brotli-dec-wasm")),
);
const wasmBytes = readFileSync(
  path.join(pkgDir, "pkg", "brotli_dec_wasm_bg.wasm"),
);

// Initialize the WASM module synchronously. initSync() is idempotent —
// calling it again once the WASM is loaded is a no-op.
initSync({ module: wasmBytes });

// Re-export as a Promise to match the real package's default export shape.
export default Promise.resolve({ decompress });
