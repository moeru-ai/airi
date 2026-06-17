/**
 * Write `steam_appid.txt` and the platform Steam API library into a depot folder.
 *
 * Preserves `steamworks_sdk/redistributable_bin/...` next to the app executable,
 * as expected by `steamworks-ffi-node` when `process.cwd()` is that directory.
 *
 * Source order:
 * 1. Local `apps/stage-tamagotchi/steamworks_sdk/redistributable_bin/` (partner SDK)
 * 2. Public mirror (`STEAMWORKS_SDK_MIRROR_*`) when local files are absent
 *
 * Usage:
 *   pnpm -F @proj-airi/stage-tamagotchi exec tsx scripts/pack-steam-redistributables.ts <windows|macos|linux> <destDir>
 */

import process from 'node:process'

import { Buffer } from 'node:buffer'
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { errorMessageFrom } from '@moeru/std'

import { STEAM_APP_ID } from '../src/main/services/steam/types'

// NOTICE:
// Temporary CI fallback is the public rlabrecque/SteamworksSDK mirror (Valve copyright).
// Replace with an org-private artifact store fed from partner.steamgames.com before long-term production use.
const DEFAULT_MIRROR_REPO = 'rlabrecque/SteamworksSDK'
const DEFAULT_MIRROR_REF = 'be6107f4b75bf996531415c53a6488a33a2a1be3'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const localSdkRoot = join(packageRoot, 'steamworks_sdk', 'redistributable_bin')

const platform = process.argv[2]
const destDir = process.argv[3]

/** Relative path under `steamworks_sdk/redistributable_bin/`. */
const redistributables: Record<string, string> = {
  windows: 'win64/steam_api64.dll',
  macos: 'osx/libsteam_api.dylib',
  linux: 'linux64/libsteam_api.so',
}

function mirrorBaseUrl(): string {
  const repo = process.env.STEAMWORKS_SDK_MIRROR_REPO ?? DEFAULT_MIRROR_REPO
  const ref = process.env.STEAMWORKS_SDK_MIRROR_REF ?? DEFAULT_MIRROR_REF
  return `https://raw.githubusercontent.com/${repo}/${ref}/redistributable_bin`
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0) {
    throw new Error(`Downloaded empty file from ${url}`)
  }

  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, bytes)
}

async function main(): Promise<void> {
  if (!platform || !destDir) {
    console.error('Usage: tsx pack-steam-redistributables.ts <windows|macos|linux> <destDir>')
    process.exit(1)
  }

  const relativePath = redistributables[platform]
  if (!relativePath) {
    console.error(`Unknown platform: ${platform}`)
    process.exit(1)
  }

  mkdirSync(destDir, { recursive: true })
  writeFileSync(join(destDir, 'steam_appid.txt'), `${STEAM_APP_ID}\n`, 'utf8')

  const dest = join(destDir, 'steamworks_sdk', 'redistributable_bin', relativePath)
  const localSrc = join(localSdkRoot, relativePath)

  if (existsSync(localSrc)) {
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(localSrc, dest)
    console.info(`[steam] copied ${relativePath} from local SDK -> ${dest}`)
    return
  }

  const url = `${mirrorBaseUrl()}/${relativePath}`
  console.info(`[steam] downloading ${relativePath} from mirror -> ${dest}`)
  await downloadFile(url, dest)
}

main().catch((error: unknown) => {
  console.error(`[steam] pack failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
  process.exit(1)
})
