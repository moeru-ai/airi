import process from 'node:process'

import { spawnSync } from 'node:child_process'

const isWindows = process.platform === 'win32'

if (!isWindows) {
  console.info('[win32-window-bindings] Skipping native build (platform is not win32)')
  process.exit(0)
}

const pnpmArgs = ['dlx', '@napi-rs/cli@2.18.0', 'build', '--platform', '--release']

// Prefer the pnpm instance that invoked this script (npm_execpath points to pnpm.cjs)
const pnpmExecPath = process.env.npm_execpath
const looksLikePnpm = pnpmExecPath && pnpmExecPath.includes('pnpm')

const result = looksLikePnpm
  ? spawnSync(
      process.execPath,
      [pnpmExecPath, ...pnpmArgs],
      {
        stdio: 'inherit',
        env: process.env,
      },
    )
  : spawnSync(
      isWindows ? 'pnpm.cmd' : 'pnpm',
      pnpmArgs,
      {
        stdio: 'inherit',
        env: process.env,
        shell: isWindows, // allow .cmd resolution when pnpm is on PATH
      },
    )

if (result.error) {
  console.error('[win32-window-bindings] Failed to spawn `napi` CLI:', result.error)
  process.exit(result.status ?? 1)
}

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
