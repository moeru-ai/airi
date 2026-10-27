import { readFileSync } from 'node:fs'
import { env } from 'node:process'

import { defineConfig } from '@ergosphere-it/electron/config'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

/**
 * The channel of a build: the prerelease name of the version, for example `beta` for `0.9.0-beta.4`, or `stable`.
 * The app can switch to another lane at run time, see `src/main/services/electron/auto-updater.ts`.
 */
function laneOf(version: string) {
  const prerelease = /^\d+\.\d+\.\d+-([a-z]+)/i.exec(version)?.[1]?.toLowerCase()
  return prerelease && ['alpha', 'beta', 'nightly', 'canary'].includes(prerelease) ? prerelease : 'stable'
}

export default defineConfig({
  channel: env.AIRI_UPDATE_CHANNEL || laneOf(version),
  // Steam updates the Steam build. Flatpak and Nix are known only at runtime, see src/launcher/index.ts.
  disabled: env.VITE_DISTRIBUTION === 'steam',
  // A test build can point at another feed and key, for example a local S3.
  feedUrl: env.AIRI_UPDATE_FEED_URL || 'https://release-updates.airi.build',
  // 2: adds the native module @napi-rs/image for WebP screenshots of computer use.
  nativeVersion: 2,
  publicKeys: env.AIRI_UPDATE_PUBLIC_KEY ? [env.AIRI_UPDATE_PUBLIC_KEY] : ['ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJcEtAvYgV3AieXiFwNNoFviCxQ5Jrc80Zm78msiTHon'],
})
