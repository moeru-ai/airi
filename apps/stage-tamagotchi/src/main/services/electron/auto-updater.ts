import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { AutoUpdaterState } from '@proj-airi/electron-eventa/electron-updater'
import type { BrowserWindow } from 'electron'
import type { UpdateInfo } from 'electron-updater'

import fs from 'node:fs'
import process from 'node:process'

import { dirname, join } from 'node:path'

import electronUpdater from 'electron-updater'

import { is } from '@electron-toolkit/utils'
import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom, tryCatch } from '@moeru/std'
import { committerDate } from '~build/git'
import { app } from 'electron'
import { Semaphore } from 'es-toolkit'

import {
  autoUpdater as autoUpdaterEventa,
  electronAutoUpdaterStateChanged,
} from '../../../shared/eventa'
import { MockAutoUpdater } from './mock-auto-updater'

function getCacheRoot() {
  switch (process.platform) {
    case 'win32':
      return process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Local')
    case 'darwin':
      return join(process.env.HOME || '', 'Library', 'Caches')
    default:
      return process.env.XDG_CACHE_HOME || join(process.env.HOME || '', '.cache')
  }
}
const CACHE_DIR = join(getCacheRoot(), 'stage-tamagotchi-updater')
const UPDATER_LOG_FILE = join(CACHE_DIR, 'updater-log.txt')

function getReleaseChannelName() {
  const arch = process.arch

  return arch === 'arm64' ? 'latest-arm64' : 'latest-x64'
}

async function logToFile(level: string, msg: string) {
  await fs.promises.mkdir(CACHE_DIR, { recursive: true }).catch(() => {})
  await fs.promises.appendFile(UPDATER_LOG_FILE, `${new Date().toISOString()} [${level}] ${msg}\n`).catch(() => {})
}

export interface AppUpdaterLike {
  on: (event: string, listener: (...args: any[]) => void) => any
  checkForUpdates: () => Promise<any>
  downloadUpdate: () => Promise<any>
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => Promise<void> | void
  setFeedURL?: (options: { provider: 'generic', url: string }) => void
  logger?: any
  allowPrerelease?: boolean
  autoDownload?: boolean
  channel?: string
}

// NOTICE: this part of code is copied from https://www.electron.build/auto-update
// Or https://github.com/electron-userland/electron-builder/blob/b866e99ccd3ea9f85bc1e840f0f6a6a162fca388/pages/auto-update.md?plain=1#L57-L66
export function fromImported(): AppUpdaterLike {
  if (is.dev) {
    return new MockAutoUpdater()
  }

  // Using destructuring to access autoUpdater due to the CommonJS module of 'electron-updater'.
  // It is a workaround for ESM compatibility issues, see https://github.com/electron-userland/electron-builder/issues/7976.
  const { autoUpdater } = electronUpdater
  return autoUpdater as unknown as AppUpdaterLike
}

type MainContext = ReturnType<typeof createContext>['context']

export interface AutoUpdater {
  state: AutoUpdaterState
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  quitAndInstall: () => void
  subscribe: (callback: (state: AutoUpdaterState) => void) => () => void
}

export function setupAutoUpdater(): AutoUpdater {
  const semaphore = new Semaphore(1)
  const isPrereleaseBuild = app.getVersion().includes('-')

  const log = useLogg('auto-updater').useGlobalConfig()
  const autoUpdater = fromImported()

  const OFFICIAL_UPDATER_CACHE_DIR = join(getCacheRoot(), 'ai.moeru.airi-updater')
  const OFFICIAL_UPDATER_PENDING_DIR = join(OFFICIAL_UPDATER_CACHE_DIR, 'pending')
  let resolvedFeedUrl = 'N/A'

  const getDiagnostics = () => {
    const executablePath = process.execPath
    const uninstallPath = process.platform === 'win32'
      ? join(dirname(executablePath), 'Uninstall airi.exe')
      : undefined

    return {
      platform: process.platform,
      arch: process.arch,
      channel: autoUpdater.channel || getReleaseChannelName(),
      feedUrl: resolvedFeedUrl,
      logFilePath: UPDATER_LOG_FILE,
      updaterCacheDir: OFFICIAL_UPDATER_CACHE_DIR,
      pendingDir: OFFICIAL_UPDATER_PENDING_DIR,
      executablePath,
      uninstallPath,
      uninstallExists: uninstallPath ? fs.existsSync(uninstallPath) : undefined,
    }
  }

  const logInstallDiagnostics = async () => {
    const diagnostics = getDiagnostics()
    await logToFile('INFO', `Install diagnostics: platform=${diagnostics.platform} arch=${diagnostics.arch} exe=${diagnostics.executablePath} uninstall=${diagnostics.uninstallPath || 'N/A'} uninstallExists=${String(diagnostics.uninstallExists ?? false)}`)
  }

  const broadcastUpdaterError = (error: unknown, reason: string) => {
    const message = `${errorMessageFrom(error) || String(error)}\n\n(See full logs at ${UPDATER_LOG_FILE})`
    broadcast({ status: 'error', error: { message } })
    log.withError(error).error(reason)
  }

  const cleanupRootInstallerArtifacts = async () => {
    const removed: string[] = []

    const directTargets = [
      join(OFFICIAL_UPDATER_CACHE_DIR, 'installer.exe'),
      join(OFFICIAL_UPDATER_CACHE_DIR, 'installer'),
    ]

    for (const target of directTargets) {
      if (fs.existsSync(target)) {
        await fs.promises.rm(target, { force: true }).catch(() => {})
        removed.push(target)
      }
    }

    const entries = await fs.promises.readdir(OFFICIAL_UPDATER_CACHE_DIR, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isFile())
        continue

      if (!/^installer(\..+)?$/i.test(entry.name))
        continue

      const target = join(OFFICIAL_UPDATER_CACHE_DIR, entry.name)
      await fs.promises.rm(target, { force: true }).catch(() => {})
      removed.push(target)
    }

    if (removed.length > 0)
      await logToFile('INFO', `Removed updater root artifacts: ${removed.join(', ')}`)
  }

  const cleanupStaleUpdateFiles = async () => {
    // Remove only installer executables from previous runs; keep pending update payloads intact.
    await cleanupRootInstallerArtifacts()
    await logToFile('INFO', `Updater cache cleanup attempted: ${OFFICIAL_UPDATER_PENDING_DIR}`)
  }

  const configureFeedForLatestRelease = async () => {
    if (is.dev)
      return

    const archChannel = getReleaseChannelName()
    const releasesApi = 'https://api.github.com/repos/moeru-ai/airi/releases?per_page=20'
    const response = await fetch(releasesApi, {
      headers: {
        'accept': 'application/vnd.github+json',
        'User-Agent': 'airi-updater',
      },
    })

    if (!response.ok)
      throw new Error(`Failed to query releases API (${response.status})`)

    const releases = await response.json() as Array<{ tag_name?: string, draft?: boolean, prerelease?: boolean }>
    const latestRelease = releases.find(release => !!release.tag_name && !release.draft && !!release.prerelease === isPrereleaseBuild)
      ?? releases.find(release => !!release.tag_name && !release.draft)
    if (!latestRelease?.tag_name)
      throw new Error('No published versions on GitHub')

    const feedUrl = `https://github.com/moeru-ai/airi/releases/download/${latestRelease.tag_name}`
    resolvedFeedUrl = feedUrl
    autoUpdater.allowPrerelease = isPrereleaseBuild
    autoUpdater.autoDownload = false
    autoUpdater.channel = archChannel
    autoUpdater.setFeedURL?.({ provider: 'generic', url: feedUrl })

    await logToFile('INFO', `Updater feed set to ${feedUrl} (channel: ${archChannel})`)
  }

  // Configure updater defaults before dynamic feed resolution.
  autoUpdater.allowPrerelease = isPrereleaseBuild
  autoUpdater.autoDownload = false
  autoUpdater.channel = getReleaseChannelName()
  void logInstallDiagnostics()
  void cleanupStaleUpdateFiles()

  autoUpdater.logger = {
    info: (msg: string) => logToFile('INFO', msg),
    warn: (msg: string) => logToFile('WARN', msg),
    error: (msg: string) => logToFile('ERROR', msg),
    debug: (msg: string) => logToFile('DEBUG', msg),
  }

  let state: AutoUpdaterState = { status: 'idle' }
  const hooks = new Set<(state: AutoUpdaterState) => void>()

  function broadcast(next: AutoUpdaterState) {
    state = {
      ...next,
      diagnostics: getDiagnostics(),
    }

    for (const listener of hooks) {
      try {
        listener(state)
      }
      catch (error) {
        log.withError(error).error('Failed to notify listener')
      }
    }
  }

  autoUpdater.on('error', error => broadcastUpdaterError(error, 'autoUpdater error'))
  autoUpdater.on('checking-for-update', () => broadcast({ status: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    void logToFile('INFO', `Update available: v${info.version}`)
    broadcast({ status: 'available', info })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => broadcast({ status: 'downloaded', info }))
  autoUpdater.on('update-not-available', () => {
    void logToFile('INFO', `Up to date: v${app.getVersion()}`)
    void cleanupStaleUpdateFiles()
    broadcast({ status: 'not-available', info: { version: app.getVersion(), files: [], releaseDate: committerDate } })
  })
  autoUpdater.on('download-progress', progress => broadcast({
    ...state,
    status: 'downloading',
    progress: {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    },
  }))

  void (async () => {
    try {
      await configureFeedForLatestRelease()
      await autoUpdater.checkForUpdates()
    }
    catch (error) {
      broadcastUpdaterError(error, 'checkForUpdates() failed')
    }
  })()

  return {
    get state() {
      return state
    },
    async checkForUpdates() {
      broadcast({ status: 'checking' })
      try {
        await configureFeedForLatestRelease()
        await autoUpdater.checkForUpdates()
      }
      catch (error) {
        broadcastUpdaterError(error, 'checkForUpdates() failed')
      }
    },
    async downloadUpdate() {
      if (state.status === 'downloading' || state.status === 'downloaded')
        return

      await semaphore.acquire()

      try {
        await autoUpdater.downloadUpdate()
      }
      finally {
        semaphore.release()
      }
    },
    async quitAndInstall() {
      await semaphore.acquire()

      try {
        if (process.platform === 'win32') {
          await logToFile('INFO', 'quitAndInstall called: platform=win32 mode=silent forceRunAfter=true')
          autoUpdater.quitAndInstall(true, true)
        }
        else {
          await logToFile('INFO', `quitAndInstall called: platform=${process.platform} mode=default`)
          autoUpdater.quitAndInstall()
        }
      }
      finally {
        semaphore.release()
      }
    },
    subscribe(callback) {
      hooks.add(callback)
      // Send current state immediately
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

export function createAutoUpdaterService(params: { context: MainContext, window: BrowserWindow, service: AutoUpdater }) {
  const { context, window, service } = params

  const log = useLogg('auto-updater-service').useGlobalConfig()

  // Subscribe to state changes and forward to the context
  const unsubscribe = service.subscribe((state) => {
    if (window.isDestroyed())
      return

    tryCatch(() => context.emit(electronAutoUpdaterStateChanged, state))
  })

  const cleanups: Array<() => void> = [unsubscribe]

  cleanups.push(
    defineInvokeHandler(context, autoUpdaterEventa.getState, () => service.state),
  )

  cleanups.push(
    defineInvokeHandler(context, autoUpdaterEventa.checkForUpdates, async () => {
      await service.checkForUpdates().catch(error => log.withError(error).error('checkForUpdates() failed'))
      return service.state
    }),
  )

  cleanups.push(
    defineInvokeHandler(context, autoUpdaterEventa.downloadUpdate, async () => {
      await service.downloadUpdate()
      return service.state
    }),
  )

  cleanups.push(
    defineInvokeHandler(context, autoUpdaterEventa.quitAndInstall, () => {
      service.quitAndInstall()
    }),
  )

  const cleanup = () => {
    for (const fn of cleanups)
      fn()
  }

  window.on('closed', cleanup)
  return cleanup
}
