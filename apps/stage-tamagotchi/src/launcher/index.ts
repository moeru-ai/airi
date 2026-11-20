import process from 'node:process'

import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import config from 'virtual:ergosphere-it/config'

import { startLauncher } from '@ergosphere-it/electron/launcher'
import { errorMessageFrom } from '@moeru/std'
import { app } from 'electron'
import { ensureSelfResponsible } from 'node-macos-disclaim'

/**
 * Makes AIRI its own TCC responsible process on macOS.
 *
 * When a terminal or Steam starts AIRI, macOS checks the privacy permissions of that launcher, not of AIRI. Screen and
 * system audio capture then gives silence, and permission prompts show the name of the launcher. The call re-execs
 * AIRI in place with the same PID. It does nothing when AIRI is already its own responsible process, for example after
 * a start from Finder or the Dock.
 *
 * Development runs keep the permissions of the terminal. The path of their Electron binary changes, so permissions
 * that macOS gave to it do not last.
 */
function becomeOwnResponsibleProcess() {
  if (!app.isPackaged)
    return

  try {
    ensureSelfResponsible()
  }
  catch (error) {
    // AIRI still works as a child of the launcher, only with the permissions of the launcher.
    console.warn(`[launcher] Cannot make AIRI its own TCC responsible process: ${errorMessageFrom(error) ?? 'unknown error'}`)
  }
}

/**
 * Flatpak and Nix installs use the build of the deb and rpm packages, so only the runtime can tell them. Their package
 * managers update the app, so the updater stays off. See `isExternallyUpdatedInstall` in
 * `src/main/services/electron/auto-updater.ts`.
 */
function isUpdatedByPackageManager() {
  return !!process.env.FLATPAK_ID || ['nix', 'terminal-beta'].includes(process.env.AIRI_DISTRIBUTION || '')
}

// Re-exec before the launcher loads a bundle, so that no update work runs twice.
becomeOwnResponsibleProcess()

// The launcher claims the instance lock before loading main. Select its profile before that claim.
if (app.isPackaged) {
  const metadata = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as { airiDistribution?: string }
  if (metadata.airiDistribution === 'terminal-beta') {
    process.env.AIRI_DISTRIBUTION = 'terminal-beta'
    process.env.SERVER_CHANNEL_PORT ||= '6131'
  }
}
const appUserDataPath = process.env.APP_USER_DATA_PATH?.trim()
  || (process.env.AIRI_DISTRIBUTION === 'terminal-beta' ? join(app.getPath('appData'), 'AIRI Terminal Beta') : undefined)
if (appUserDataPath) {
  mkdirSync(appUserDataPath, { recursive: true })
  app.setPath('userData', appUserDataPath)
}

// NOTICE: Electron emits `ready` only after the top-level await of its entry, so the bundle main starts before ready.
// See the custom launcher section of the @ergosphere-it/electron API reference.
// eslint-disable-next-line antfu/no-top-level-await
await startLauncher({
  ...config,
  disabled: config.disabled || isUpdatedByPackageManager(),
  launcherUrl: import.meta.url,
})
