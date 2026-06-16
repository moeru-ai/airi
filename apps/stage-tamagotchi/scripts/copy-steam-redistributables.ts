/**
 * Copy Steam redistributable binaries and steam_appid.txt into a build output folder.
 *
 * Expects Valve SDK at apps/stage-tamagotchi/steamworks_sdk/redistributable_bin/
 * (not committed; download from Steamworks partner site).
 *
 * Usage:
 *   pnpm -F @proj-airi/stage-tamagotchi exec tsx scripts/copy-steam-redistributables.ts <windows|macos|linux> <destDir>
 */

import process from 'node:process'

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { STEAM_APP_ID } from '../src/main/services/steam/types'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const sdkRoot = join(packageRoot, 'steamworks_sdk', 'redistributable_bin')

const platform = process.argv[2]
const destDir = process.argv[3]

if (!platform || !destDir) {
  console.error('Usage: tsx copy-steam-redistributables.ts <windows|macos|linux> <destDir>')
  process.exit(1)
}

const redistributables: Record<string, { from: string, to: string }[]> = {
  windows: [{ from: 'win64/steam_api64.dll', to: 'steam_api64.dll' }],
  macos: [{ from: 'osx/libsteam_api.dylib', to: 'libsteam_api.dylib' }],
  linux: [{ from: 'linux64/libsteam_api.so', to: 'libsteam_api.so' }],
}

const files = redistributables[platform]
if (!files) {
  console.error(`Unknown platform: ${platform}`)
  process.exit(1)
}

mkdirSync(destDir, { recursive: true })
writeFileSync(join(destDir, 'steam_appid.txt'), `${STEAM_APP_ID}\n`, 'utf8')

if (!existsSync(sdkRoot)) {
  console.warn(`[steam] steamworks_sdk not found at ${sdkRoot}; wrote steam_appid.txt only`)
  process.exit(0)
}

for (const { from, to } of files) {
  const src = join(sdkRoot, from)
  if (!existsSync(src)) {
    console.warn(`[steam] missing ${src}`)
    continue
  }
  cpSync(src, join(destDir, to))
  console.info(`[steam] copied ${basename(to)} -> ${destDir}`)
}
