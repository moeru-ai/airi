import type { BundleInfo, LauncherEvent, Updater, UpdaterStatus } from '@ergosphere-it/electron/main'
import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { AutoUpdaterState } from '@proj-airi/electron-eventa/electron-updater'
import type { BrowserWindow } from 'electron'

import type { ElectronUpdaterChannel } from '../../../shared/eventa'

import process from 'node:process'

import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'

import { activeBundle, updater as ergosphereUpdater } from '@ergosphere-it/electron/main'
import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { tryCatch } from '@moeru/std'
import { errorMessageFromValue } from '@proj-airi/stage-shared'
import { app } from 'electron'
import { isWindows } from 'std-env'

import {
  autoUpdater as autoUpdaterEventa,
  electronAutoUpdaterStateChanged,
  electronGetUpdaterPreferences,
  electronSetUpdaterPreferences,
} from '../../../shared/eventa'
import { channelOfVersion, updateChannels } from '../../../shared/update-channels'

const UPDATE_CHANNEL_ENV_KEY = 'AIRI_UPDATE_CHANNEL'

/**
 * The updater log is next to the session logs of `app/file-logger.ts`, in the user data directory. So an install with
 * its own user data directory, for example a test build, writes its own log.
 */
function updaterLogFile() {
  return join(app.getPath('userData'), 'logs', 'updater-log.txt')
}

async function logToFile(level: 'INFO' | 'WARN' | 'ERROR', message: string) {
  const file = updaterLogFile()
  await mkdir(dirname(file), { recursive: true }).catch(() => {})
  await appendFile(file, `${new Date().toISOString()} [${level}] ${message}\n`).catch(() => {})
}

export type UpdateLane = ElectronUpdaterChannel

function normalizeLane(value: string | undefined): UpdateLane | undefined {
  const lane = value?.toLowerCase()
  return updateChannels.find(channel => channel === lane)
}

/**
 * The lane that the user or the environment chose: `AIRI_UPDATE_CHANNEL`, then the channel that the user chose.
 * Without one, the app follows the channel of its version, see `channelOfVersion`, so a nightly build follows `nightly`.
 *
 * Each lane is a channel of the ergosphere-it release store with the same name.
 */
export function getChosenUpdateLane(storedLane: UpdateLane | undefined): UpdateLane | undefined {
  return normalizeLane(process.env[UPDATE_CHANNEL_ENV_KEY]?.trim()) ?? storedLane
}

function isPathInside(parentPath: string, targetPath: string) {
  const normalizedParent = normalize(parentPath)
  const normalizedTarget = normalize(targetPath)
  const parentWithSeparator = normalizedParent.endsWith('\\') ? normalizedParent : `${normalizedParent}\\`
  return normalizedTarget === normalizedParent || normalizedTarget.startsWith(parentWithSeparator)
}

function getWindowsProtectedInstallRoots() {
  return [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.ProgramW6432,
    process.env.SystemRoot,
    process.env.windir,
  ]
    .filter((value): value is string => Boolean(value))
    .map(value => normalize(value))
}

function requiresAdminForInstallPath(executablePath: string) {
  if (!isWindows)
    return false

  const installDirectory = dirname(executablePath)
  return getWindowsProtectedInstallRoots().some(root => isPathInside(root, installDirectory))
}

/**
 * The update info that the renderer shows. The release ID of a build is its time in milliseconds, so it gives the
 * release date.
 */
function infoOf(bundle: BundleInfo): NonNullable<AutoUpdaterState['info']> {
  return {
    version: bundle.version,
    files: [],
    releaseDate: new Date(bundle.releaseId).toISOString(),
  }
}

function describeBundle(bundle: BundleInfo) {
  return `${bundle.version} (${bundle.releaseId})`
}

/**
 * Maps the status of the ergosphere-it updater to the state that the AIRI renderer knows.
 *
 * The updater downloads an update by itself after a check, so the renderer never sees `available`. `ready` is
 * `downloaded`, and `quitAndInstall` applies it: a page reload, a restart, or an installer.
 */
export function stateFromStatus(status: UpdaterStatus): AutoUpdaterState {
  switch (status.status) {
    case 'idle':
    case 'checking':
      return { status: status.status }
    case 'disabled':
      return { status: 'disabled' }
    case 'up-to-date':
      return { status: 'not-available', info: infoOf(activeBundle) }
    case 'manual-install-required':
      return { status: 'manual-install-required', info: infoOf(status.update) }
    case 'downloading':
      return {
        status: 'downloading',
        info: infoOf(status.update),
        progress: { percent: status.percent, bytesPerSecond: status.bytesPerSecond, transferred: status.downloadedBytes, total: status.totalBytes },
      }
    case 'preparing':
      // Work after a download, for example a Sparkle patch, has a percentage and no bytes.
      return {
        status: 'downloading',
        info: infoOf(status.update),
        progress: { percent: status.percent, bytesPerSecond: 0, transferred: 0, total: 0 },
      }
    case 'ready':
    case 'applying':
      return { status: 'downloaded', info: infoOf(status.update) }
    case 'download-failed':
      return { status: 'error', info: infoOf(status.update), error: { message: `${status.error.message} The updater tries again at ${status.retryAt}.` } }
    case 'error':
    case 'verification-failed':
      return { status: 'error', error: { message: status.error.message } }
    case 'rolled-back':
      // A rollback runs a bundle that works, and nothing waits. The service logs it and dismisses it.
      return { status: 'not-available', info: infoOf(activeBundle) }
  }
}

export interface AutoUpdater {
  state: AutoUpdaterState
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  quitAndInstall: () => Promise<void>
  /** Main started every module. With the page of the main window, the running bundle reports healthy. */
  markMainReady: () => void
  /** The main window mounted its page, also after a page-only update reloaded it. */
  markMainPageMounted: () => void
  getPreferredUpdateLane: () => UpdateLane | undefined
  setPreferredUpdateLane: (lane: UpdateLane | undefined) => Promise<void>
  subscribe: (callback: (state: AutoUpdaterState) => void) => () => void
}

export interface AutoUpdaterOptions {
  /**
   * Whether AIRI owns application updates for this distribution.
   *
   * @default true
   */
  enabled?: boolean
  /** Reads the release channel persisted by the application configuration. */
  getStoredUpdateLane?: () => UpdateLane | undefined
  /** Persists a release-channel change requested through updater IPC. */
  setStoredUpdateLane?: (lane: UpdateLane | undefined) => void
  /** The updater of `@ergosphere-it/electron/main`. Tests pass their own. */
  updater?: Updater
}

/**
 * Returns whether a store or a package manager updates this installation, so AIRI must not run its own updater.
 *
 * - Steam builds set `VITE_DISTRIBUTION=steam` at build time.
 * - The Flatpak bundle uses the same JavaScript build as the deb and rpm packages, so only the runtime can tell.
 *   Flatpak sets `FLATPAK_ID` in each sandbox. Flathub updates the app with `flatpak update`.
 * - The Nix package runs the app from the read-only Nix store, so the updater cannot replace it.
 *   The `nix/package.nix` launcher sets `AIRI_DISTRIBUTION=nix`. Nix updates the app with a new derivation.
 *
 * The launcher in `src/launcher/index.ts` turns the ergosphere-it updater off for the same installs.
 */
export function isExternallyUpdatedInstall() {
  return import.meta.env.VITE_DISTRIBUTION === 'steam'
    || !!process.env.FLATPAK_ID
    || process.env.AIRI_DISTRIBUTION === 'nix'
}

/**
 * Preserves the updater IPC contract when the storefront owns application updates.
 *
 * No method reaches the updater, while preference reads and subscriptions remain available to existing renderer
 * consumers.
 */
function createDisabledAutoUpdater(options: AutoUpdaterOptions): AutoUpdater {
  const state: AutoUpdaterState = { status: 'disabled' }
  let storedPreferredLane = options.getStoredUpdateLane?.()

  return {
    state,
    async checkForUpdates() {},
    async downloadUpdate() {},
    async quitAndInstall() {},
    markMainReady() {},
    markMainPageMounted() {},
    getPreferredUpdateLane() {
      return storedPreferredLane
    },
    async setPreferredUpdateLane(lane) {
      storedPreferredLane = lane
      options.setStoredUpdateLane?.(lane)
    },
    subscribe(callback) {
      callback(state)
      return () => {}
    },
  }
}

/**
 * Serves the AIRI updater contract with the ergosphere-it updater, which the launcher runs. It checks at launch and
 * then every hour by itself, downloads bundles and installers, and rolls back a bundle that does not report healthy.
 */
export function setupAutoUpdater(options: AutoUpdaterOptions = {}): AutoUpdater {
  if (options.enabled === false)
    return createDisabledAutoUpdater(options)

  const log = useLogg('auto-updater').useGlobalConfig()
  const updater = options.updater ?? ergosphereUpdater
  let storedPreferredLane = options.getStoredUpdateLane?.()

  /** Moves the updater to `lane`, and returns whether the channel changed. The updater saves it for the next launches. */
  function follow(lane: UpdateLane) {
    if (updater.channel === lane)
      return false

    log.log(`[auto-updater] follows the channel ${lane}`)
    updater.channel = lane
    return true
  }

  const withDiagnostics = (next: AutoUpdaterState): AutoUpdaterState => ({
    ...next,
    diagnostics: {
      platform: process.platform,
      arch: process.arch,
      channel: updater.channel,
      logFilePath: updaterLogFile(),
      executablePath: process.execPath,
      installDirectory: dirname(process.execPath),
      requiresAdminForInstallPath: requiresAdminForInstallPath(process.execPath),
      isOverrideActive: !!process.env[UPDATE_CHANNEL_ENV_KEY],
    },
  })

  let state: AutoUpdaterState = withDiagnostics(stateFromStatus(updater.status))
  const hooks = new Set<(state: AutoUpdaterState) => void>()

  function broadcast(next: AutoUpdaterState) {
    state = withDiagnostics(next)

    for (const listener of hooks) {
      try {
        listener(state)
      }
      catch (error) {
        log.withError(error).error('Failed to notify listener')
      }
    }
  }

  function broadcastUpdaterError(error: unknown, reason: string) {
    broadcast({
      status: 'error',
      error: { message: errorMessageFromValue(error) },
    })
    log.withError(error).error(reason)
  }

  if (updater.status.status !== 'disabled') {
    // NOTICE:
    // Up to v0.13.0, the launcher saved `latest`, `alpha`, or `beta`, which the store never had. Each check got a 404.
    // `src/main/configs/global.ts` maps the choice of the user. This maps the channel that the launcher saved.
    // Remove it after the next stable release, with the mapping in `global.ts`.
    const savedRemovedChannel = ['latest', 'alpha', 'beta'].includes(updater.channel)
    const lane = getChosenUpdateLane(storedPreferredLane) ?? (savedRemovedChannel ? channelOfVersion(activeBundle.version) : undefined)
    if (lane)
      follow(lane)
  }

  updater.onEvent((event: LauncherEvent) => {
    // A download reports progress many times a second. Its start and its end are statuses of their own.
    if (event.type === 'status' && event.status.status === 'downloading')
      return

    void logToFile(event.type === 'boot-failed' || event.type === 'rollback' ? 'ERROR' : 'INFO', JSON.stringify(event))
  })

  updater.onStatus((status) => {
    if (status.status === 'rolled-back') {
      const message = `[auto-updater] left ${describeBundle(status.from)} for ${describeBundle(status.to)}: ${status.reason}`
      log.warn(message)
      void logToFile('WARN', message)
      void updater.dismissRollback()
    }
    if (status.status === 'error' || status.status === 'verification-failed' || status.status === 'download-failed')
      void logToFile('ERROR', `[auto-updater] ${status.status} ${status.error.code}: ${status.error.message}`)

    broadcast(stateFromStatus(status))
  })

  // A second click while the update applies waits for the same apply. A reload keeps the app, so a later update can
  // apply again.
  let applying: Promise<void> | undefined

  // The launcher keeps a new bundle only when it reports healthy, and rolls it back otherwise. The bundle works when
  // main started every module and the main window finished loading its stage. After a page-only update, the reloaded
  // page reports again.
  let mainReady = false
  let pageMounted = false
  function reportHealthWhenReady() {
    if (mainReady && pageMounted && updater.status.status !== 'disabled')
      updater.markBundleHealthy()
  }

  return {
    get state() {
      return state
    },
    async checkForUpdates() {
      if (updater.status.status === 'disabled')
        return

      await updater.checkForUpdates().catch(error => broadcastUpdaterError(error, 'checkForUpdates() failed'))
    },
    async downloadUpdate() {
      // The updater downloads an update by itself after a check finds it.
    },
    async quitAndInstall() {
      if (!applying && updater.status.status !== 'ready')
        return

      applying ??= updater.applyUpdate()
        .catch(error => broadcastUpdaterError(error, 'applyUpdate() failed'))
        .finally(() => {
          applying = undefined
        })
      await applying
    },
    markMainReady() {
      mainReady = true
      reportHealthWhenReady()
    },
    markMainPageMounted() {
      pageMounted = true
      reportHealthWhenReady()
    },
    getPreferredUpdateLane() {
      return storedPreferredLane
    },
    async setPreferredUpdateLane(lane) {
      if (storedPreferredLane === lane)
        return

      storedPreferredLane = lane
      options.setStoredUpdateLane?.(lane)
      const next = getChosenUpdateLane(lane) ?? channelOfVersion(activeBundle.version)
      if (updater.status.status !== 'disabled' && follow(next))
        await updater.checkForUpdates().catch(error => broadcastUpdaterError(error, 'checkForUpdates() failed'))
    },
    subscribe(callback) {
      hooks.add(callback)

      try {
        callback(state)
      }
      catch {}

      return () => {
        hooks.delete(callback)
      }
    },
  }
}

/**
 * Serves the updater IPC to the renderer of one window.
 *
 * `context` must hear only this window, so one click runs one handler. Use the context from `createWindowContext`.
 *
 * Returns a cleanup that stops the state broadcast and removes the handlers before the window closes.
 */
export function createAutoUpdaterService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow, service: AutoUpdater }) {
  const { context, window, service } = params

  const log = useLogg('auto-updater-service').useGlobalConfig()

  const unsubscribe = service.subscribe((state) => {
    if (window.isDestroyed())
      return

    tryCatch(() => context.emit(electronAutoUpdaterStateChanged, state))
  })

  const cleanups: Array<() => void> = [
    unsubscribe,
    defineInvokeHandler(context, autoUpdaterEventa.getState, () => service.state),
    defineInvokeHandler(context, autoUpdaterEventa.checkForUpdates, async () => {
      await service.checkForUpdates().catch(error => log.withError(error).error('checkForUpdates() failed'))
      return service.state
    }),
    defineInvokeHandler(context, autoUpdaterEventa.downloadUpdate, async () => {
      await service.downloadUpdate()
      return service.state
    }),
    defineInvokeHandler(context, electronGetUpdaterPreferences, async () => ({
      channel: service.getPreferredUpdateLane(),
    })),
    defineInvokeHandler(context, electronSetUpdaterPreferences, async (payload) => {
      await service.setPreferredUpdateLane(payload?.channel)
      return {
        channel: service.getPreferredUpdateLane(),
      }
    }),
    defineInvokeHandler(context, autoUpdaterEventa.quitAndInstall, async () => {
      await service.quitAndInstall()
    }),
  ]

  const cleanup = () => {
    for (const fn of cleanups)
      fn()
  }

  window.on('closed', cleanup)
  return cleanup
}
