/**
 * Builds the Node-API binding on Windows hosts that have Cargo.
 * On other platforms, and on Windows without Cargo, it exits with success.
 * Then `index.js` cannot load a binding, and dock mode uses the Electron-only window tracker.
 *
 * Call stack:
 *
 * pnpm install (root `postinstall`)
 *   -> pnpm run build:packages
 *     -> turbo run build
 *       -> build-if-win32.mjs
 *         -> napi build --platform --release --js false
 *           -> cargo build
 */

import process from 'node:process'

import { spawnSync } from 'node:child_process'

import { isWindows } from 'std-env'

/**
 * Set this variable to `1` to make the build fail when Cargo is not available.
 * Use it in CI or release jobs that must ship the binding.
 * `turbo.json` passes it through to this task.
 */
const REQUIRE_NATIVE_BUILD_ENV = 'AIRI_REQUIRE_NATIVE_WINDOW_WIN32'

if (!isWindows) {
  console.info('[native-window-win32] Skipping native build (platform is not win32)')
  process.exit(0)
}

// The napi CLI runs `$CARGO` when it is set, and `cargo` from PATH when it is not.
const cargo = process.env.CARGO ?? 'cargo'
const cargoVersion = spawnSync(cargo, ['--version'], { stdio: 'ignore' })

if (cargoVersion.error || cargoVersion.status !== 0) {
  if (process.env[REQUIRE_NATIVE_BUILD_ENV] === '1') {
    console.error(`[native-window-win32] \`${cargo} --version\` failed. ${REQUIRE_NATIVE_BUILD_ENV}=1 requires the native build.`)
    process.exit(1)
  }

  console.warn(`[native-window-win32] Skipping native build: \`${cargo} --version\` failed. Install Rust to build the binding.`)
  console.warn(`[native-window-win32] Without the binding, dock mode uses the Electron-only window tracker. Set ${REQUIRE_NATIVE_BUILD_ENV}=1 to make this an error.`)
  process.exit(0)
}

// `pnpm run` puts `node_modules/.bin` on PATH. On Windows, `napi` there is a `.cmd` shim,
// and Node.js starts `.cmd` files only through a shell.
// `--js false` keeps the committed `index.js` loader. The napi CLI still writes `index.d.ts`.
const result = spawnSync('napi build --platform --release --js false', {
  shell: true,
  stdio: 'inherit',
})

if (result.error) {
  console.error('[native-window-win32] Failed to spawn `napi` CLI:', result.error)
  process.exit(1)
}

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
