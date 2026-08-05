/**
 * Writes `steam_appid.txt` from `STEAM_APP_ID` and copies the committed platform
 * Steam API library into a depot folder.
 *
 * Source is the committed `steamworks_sdk/` tree at the tamagotchi package root;
 * the destination preserves the `steamworks_sdk/redistributable_bin/...` layout
 * expected by `steamworks-ffi-node` next to the executable.
 *
 * Steam CI injects these in electron-builder `afterPack` (before codesign/notarize)
 * so macOS Gatekeeper does not see a broken seal. Do not copy them into an already
 * signed `.app` in the depot packaging step.
 *
 * Usage:
 *   pnpm -F @proj-airi/stage-tamagotchi exec tsx scripts/pack-steam-redistributables.ts <windows|macos|linux> <destDir>
 *
 * Local dev must run this script once to generate `steam_appid.txt` next to the
 * committed `steamworks_sdk/` tree, which `services/steam/client.ts` resolves from
 * `process.cwd()`.
 */

import process from 'node:process'

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { errorMessageFrom } from '@moeru/std'

/** Relative path under `steamworks_sdk/redistributable_bin/`. */
const redistributables: Record<string, string> = {
  windows: 'win64/steam_api64.dll',
  macos: 'osx/libsteam_api.dylib',
  linux: 'linux64/libsteam_api.so',
}

/** Committed files live at the package root (`scripts/` -> package root). */
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SDK_ROOT = join(PACKAGE_ROOT, 'steamworks_sdk')
const STEAM_APP_ID = process.env.STEAM_APP_ID?.trim()

export type SteamRedistributablePlatform = keyof typeof redistributables

/**
 * Writes `steam_appid.txt` and copies the platform Steam API library into `destDir`.
 */
export function packSteamRedistributables(
  platform: SteamRedistributablePlatform,
  destDir: string,
): void {
  if (!STEAM_APP_ID)
    throw new Error('STEAM_APP_ID environment variable is required')

  const relativePath = redistributables[platform]
  const resolvedDestDir = resolve(destDir)
  mkdirSync(resolvedDestDir, { recursive: true })
  writeFileSync(join(resolvedDestDir, 'steam_appid.txt'), `${STEAM_APP_ID}\n`, 'utf8')

  const dest = join(resolvedDestDir, 'steamworks_sdk', 'redistributable_bin', relativePath)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(join(SDK_ROOT, 'redistributable_bin', relativePath), dest)
  console.info(`[steam] copied ${relativePath} + steam_appid.txt -> ${resolvedDestDir}`)
}

async function main(): Promise<void> {
  const platform = process.argv[2]
  const destDir = process.argv[3]

  if (!platform || !destDir) {
    console.error('Usage: tsx pack-steam-redistributables.ts <windows|macos|linux> <destDir>')
    process.exit(1)
  }

  if (!(platform in redistributables)) {
    console.error(`Unknown platform: ${platform}`)
    process.exit(1)
  }

  packSteamRedistributables(platform as SteamRedistributablePlatform, destDir)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`[steam] pack failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
    process.exit(1)
  })
}
