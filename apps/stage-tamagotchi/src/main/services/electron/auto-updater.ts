import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'
import type { UpdateInfo } from 'electron-updater'

import type { AutoUpdaterState } from '../../../shared/eventa'

import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { env, platform } from 'node:process'

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

export interface AppUpdaterLike {
  channel?: string
  allowPrerelease?: boolean
  allowDowngrade?: boolean
  on: (event: string, listener: (...args: any[]) => void) => any
  checkForUpdates: () => Promise<any>
  downloadUpdate: () => Promise<any>
  quitAndInstall: () => Promise<void>
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

function getAppCacheDir(): string {
  const home = homedir()
  if (platform === 'win32') {
    return env.LOCALAPPDATA || join(home, 'AppData', 'Local')
  }
  else if (platform === 'darwin') {
    return join(home, 'Library', 'Caches')
  }
  else {
    return env.XDG_CACHE_HOME || join(home, '.cache')
  }
}

export function setupAutoUpdater(): AutoUpdater {
  const semaphore = new Semaphore(1)

  const log = useLogg('auto-updater').useGlobalConfig()
  const autoUpdater = fromImported()

  // Prevent accidental downgrades — stale/corrupt cache can otherwise trick
  // electron-updater into treating an older build as the "latest".
  autoUpdater.allowDowngrade = false

  // Allow prerelease builds — Airi uses semver prerelease tags (alpha/beta).
  // The electron-updater patch in patches/ prevents the yml channel name from
  // being overridden to 'latest-beta'; we always use the baked-in 'latest-x64'
  // (or 'latest-arm64') from app-update.yml.
  autoUpdater.allowPrerelease = true

  // Clean up any stray installation files left over in the update cache directory
  try {
    const cacheDir = getAppCacheDir()
    if (cacheDir) {
      rmSync(join(cacheDir, 'ai.moeru.airi-updater'), { recursive: true, force: true })
    }
  }
  catch (error) {
    log.withError(error).warn('Failed to clean up updater cache')
  }

  // Fix electron-updater GitHubProvider: replace the atom-feed approach with
  // a direct GitHub REST API call. The releases.atom endpoint silently returns
  // null/empty in Electron's net module, causing a spurious
  // "No published versions on GitHub" error on every startup.
  if (!is.dev) {
    try {
      const _req = createRequire(import.meta.url)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { GitHubProvider } = _req('electron-updater/out/providers/GitHubProvider') as any
      const { newUrlFromBase } = _req('electron-updater/out/util')
      const { parseUpdateInfo } = _req('electron-updater/out/providers/Provider')
      const { CancellationToken, newError: _newError } = _req('builder-util-runtime')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      GitHubProvider.prototype.getLatestVersion = async function (this: any) {
        const cancellationToken = new CancellationToken()
        const releasesPath = this.computeGithubBasePath(
          `/repos/${this.options.owner}/${this.options.repo}/releases`,
        )
        const releasesUrl = newUrlFromBase(releasesPath, this.baseApiUrl)
        let releasesRaw: string | null
        try {
          releasesRaw = await this.httpRequest(
            releasesUrl,
            { Accept: 'application/vnd.github.v3+json' },
            cancellationToken,
          )
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        catch (e: any) {
          throw _newError(
            `Unable to fetch releases from GitHub (${releasesUrl}): ${e.stack || e.message}`,
            'ERR_UPDATER_LATEST_VERSION_NOT_FOUND',
          )
        }
        if (releasesRaw == null)
          throw _newError('No published versions on GitHub', 'ERR_UPDATER_NO_PUBLISHED_VERSIONS')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const releases: any[] = JSON.parse(releasesRaw)
        const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
        const channelFile = `latest-${arch}.yml`
        let channelFileUrl = ''
        let rawData: string | null = null
        let tag: string | null = null
        let releaseName: string | null = null
        let releaseNotes: string | null = null
        for (const release of releases) {
          if (release.draft)
            continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ymlAsset = ((release.assets as any[]) ?? []).find((a: any) => a.name === channelFile)
          if (!ymlAsset)
            continue
          channelFileUrl = ymlAsset.browser_download_url
          try {
            const ymlUrl = new URL(channelFileUrl)
            rawData = await this.httpRequest(ymlUrl, { Accept: '*/*' }, cancellationToken)
            if (rawData == null)
              continue
            tag = release.tag_name
            releaseName = release.name || release.tag_name
            releaseNotes = release.body ?? null
            break
          }
          catch {
            continue
          }
        }
        if (tag == null)
          throw _newError('No published versions on GitHub', 'ERR_UPDATER_NO_PUBLISHED_VERSIONS')
        const result = parseUpdateInfo(rawData!, channelFile, channelFileUrl)
        if (result.releaseName == null)
          result.releaseName = releaseName
        if (result.releaseNotes == null)
          result.releaseNotes = releaseNotes
        return { tag, ...result }
      }
    }
    catch (err) {
      log.withError(err).warn('Failed to patch GitHubProvider.getLatestVersion — update checks may fail')
    }
  }

  let state: AutoUpdaterState = { status: 'idle' }
  const hooks = new Set<(state: AutoUpdaterState) => void>()

  function broadcast(next: AutoUpdaterState) {
    state = next

    for (const listener of hooks) {
      try {
        listener(next)
      }
      catch (error) {
        log.withError(error).error('Failed to notify listener')
      }
    }
  }

  autoUpdater.on('error', error => broadcast({ status: 'error', error: { message: errorMessageFrom(error) || String(error) } }))
  autoUpdater.on('checking-for-update', () => broadcast({ status: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) => broadcast({ status: 'available', info }))
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => broadcast({ status: 'downloaded', info }))
  autoUpdater.on('update-not-available', () => broadcast({ status: 'not-available', info: { version: app.getVersion(), files: [], releaseDate: committerDate } }))
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

  autoUpdater.checkForUpdates().catch(error => log.withError(error).error('checkForUpdates() failed'))

  return {
    get state() {
      return state
    },
    async checkForUpdates() {
      broadcast({ status: 'checking' })
      await autoUpdater.checkForUpdates().catch(error => log.withError(error).error('checkForUpdates() failed'))
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
        autoUpdater.quitAndInstall()
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
