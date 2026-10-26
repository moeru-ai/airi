import process from 'node:process'

import config from 'virtual:ergosphere-it/config'

import { startLauncher } from '@ergosphere-it/electron/launcher'

/**
 * Flatpak and Nix installs use the build of the deb and rpm packages, so only the runtime can tell them. Their package
 * managers update the app, so the updater stays off. See `isExternallyUpdatedInstall` in
 * `src/main/services/electron/auto-updater.ts`.
 */
function isUpdatedByPackageManager() {
  return !!process.env.FLATPAK_ID || process.env.AIRI_DISTRIBUTION === 'nix'
}

// NOTICE: Electron emits `ready` only after the top-level await of its entry, so the bundle main starts before ready.
// See the custom launcher section of the @ergosphere-it/electron API reference.
// eslint-disable-next-line antfu/no-top-level-await
await startLauncher({
  ...config,
  disabled: config.disabled || isUpdatedByPackageManager(),
  launcherUrl: import.meta.url,
})
