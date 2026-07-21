import process from 'node:process'

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const REDISTRIBUTABLE_RELATIVE_PATH: Partial<Record<NodeJS.Platform, string>> = {
  darwin: join('osx', 'libsteam_api.dylib'),
  win32: join('win64', 'steam_api64.dll'),
  linux: join('linux64', 'libsteam_api.so'),
}

/**
 * Locates the `steamworks_sdk` folder that contains platform redistributables.
 *
 * Steam macOS depots place redistributables next to `AIRI.app`, while Electron's
 * `process.cwd()` is often `/` or inside `Contents/MacOS`. Search cwd, parents,
 * and paths derived from `execPath` so `steamworks-ffi-node` can load the dylib.
 */
export function resolveSteamworksSdkDir(params: {
  cwd?: string
  execPath?: string
} = {}): string | null {
  const platformPath = REDISTRIBUTABLE_RELATIVE_PATH[process.platform]
  if (!platformPath)
    return null

  const cwd = params.cwd ?? process.cwd()
  const execDir = dirname(params.execPath ?? process.execPath)
  const candidates = [
    cwd,
    resolve(cwd, '..'),
    resolve(cwd, '../..'),
    execDir,
    resolve(execDir, '../..'),
    // macOS Steam: redistributables sit beside AIRI.app, not inside it.
    resolve(execDir, '../../..'),
    resolve(execDir, '../../../..'),
  ]

  for (const base of candidates) {
    const sdkDir = join(base, 'steamworks_sdk')
    if (existsSync(join(sdkDir, 'redistributable_bin', platformPath)))
      return sdkDir
  }

  return null
}
