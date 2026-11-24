import { readFileSync } from 'node:fs'
import { env } from 'node:process'

import { defineConfig } from '@ergosphere-it/electron/config'

// Node loads this file with type stripping, which resolves only full file names.
// eslint-disable-next-line no-restricted-syntax
import { channelOfVersion } from './src/shared/update-channels.ts'

// CI names each build in `ERGOSPHERE_IT_VERSION`, for example `0.13.1-nightly.12.13eef81`. The build uses the same name.
const version = env.ERGOSPHERE_IT_VERSION
  || (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

export default defineConfig({
  // The app can switch to another channel at run time, see `src/main/services/electron/auto-updater.ts`.
  channel: env.AIRI_UPDATE_CHANNEL || channelOfVersion(version),
  // Steam updates the Steam build. Flatpak and Nix are known only at runtime, see src/launcher/index.ts.
  disabled: env.VITE_DISTRIBUTION === 'steam',
  // A test build can point at another feed and key, for example a local S3.
  feedUrl: env.AIRI_UPDATE_FEED_URL || 'https://release-updates.airi.build',
  // 3: requires an installer with Electron 43.8.4 to fix CVE-2026-111497. Bundle updates cannot replace Electron.
  nativeVersion: 3,
  publicKeys: env.AIRI_UPDATE_PUBLIC_KEY ? [env.AIRI_UPDATE_PUBLIC_KEY] : ['ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJcEtAvYgV3AieXiFwNNoFviCxQ5Jrc80Zm78msiTHon'],
})
