import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { AutoUpdaterState } from '@proj-airi/electron-eventa/electron-updater'
import type { BrowserWindow } from 'electron'
import type { UpdateInfo } from 'electron-updater'

import process from 'node:process'

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

function getReleaseChannelName() {
  return process.arch === 'arm64' ? 'latest-arm64' : 'latest-x64'
}

function getUpdateServerOverride() {
  const value = process.env.UPDATE_SERVER_URL?.trim()
  return value || undefined
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
  forceDevUpdateConfig?: boolean
}

// NOTICE: this part of code is copied from https://www.electron.build/auto-update
// Or https://github.com/electron-userland/electron-builder/blob/b866e99ccd3ea9f85bc1e840f0f6a6a162fca388/pages/auto-update.md?plain=1#L57-L66
export function fromImported(): AppUpdaterLike {
  if (is.dev && !getUpdateServerOverride())
    return new MockAutoUpdater()

  const { autoUpdater } = electronUpdater
  return autoUpdater as unknown as AppUpdaterLike
}

type MainContext = ReturnType<typeof createContext>['context']

export interface AutoUpdater {
  state: AutoUpdaterState
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  quitAndInstall: () => Promise<void>
  subscribe: (callback: (state: AutoUpdaterState) => void) => () => void
}

export function setupAutoUpdater(): AutoUpdater {
  const semaphore = new Semaphore(1)
  const isPrereleaseBuild = app.getVersion().includes('-')
  const log = useLogg('auto-updater').useGlobalConfig()
  const autoUpdater = fromImported()
  const feedUrlOverride = getUpdateServerOverride()

  autoUpdater.allowPrerelease = isPrereleaseBuild
  autoUpdater.autoDownload = false
  autoUpdater.channel = getReleaseChannelName()
  autoUpdater.forceDevUpdateConfig = !!feedUrlOverride && !app.isPackaged
  autoUpdater.logger = {
    info: (message: string) => log.log(message),
    warn: (message: string) => log.warn(message),
    error: (message: string) => log.error(message),
    debug: (message: string) => log.debug(message),
  }

  if (feedUrlOverride)
    autoUpdater.setFeedURL?.({ provider: 'generic', url: feedUrlOverride })

  const withDiagnostics = (next: AutoUpdaterState): AutoUpdaterState => ({
    ...next,
    diagnostics: {
      platform: process.platform,
      arch: process.arch,
      channel: autoUpdater.channel || getReleaseChannelName(),
      logFilePath: app.getPath('logs'),
      executablePath: process.execPath,
      isOverrideActive: !!feedUrlOverride,
      ...(feedUrlOverride ? { feedUrl: feedUrlOverride } : {}),
    },
  })

  let state: AutoUpdaterState = withDiagnostics({ status: 'idle' })
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
      error: { message: errorMessageFrom(error) ?? String(error) },
    })
    log.withError(error).error(reason)
  }

  autoUpdater.on('error', error => broadcastUpdaterError(error, 'autoUpdater error'))
  autoUpdater.on('checking-for-update', () => broadcast({ status: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) => broadcast({ status: 'available', info }))
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => broadcast({ status: 'downloaded', info }))
  autoUpdater.on('update-not-available', () => broadcast({
    status: 'not-available',
    info: {
      version: app.getVersion(),
      files: [],
      releaseDate: committerDate,
    },
  }))
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

  void autoUpdater
    .checkForUpdates()
    .catch(error => broadcastUpdaterError(error, 'checkForUpdates() failed'))

  return {
    get state() {
      return state
    },
    async checkForUpdates() {
      broadcast({ status: 'checking' })
      await autoUpdater.checkForUpdates().catch(error => broadcastUpdaterError(error, 'checkForUpdates() failed'))
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
        if (process.platform === 'win32')
          autoUpdater.quitAndInstall(true, true)
        else
          autoUpdater.quitAndInstall()
      }
      finally {
        semaphore.release()
      }
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

export function createAutoUpdaterService(params: { context: MainContext, window: BrowserWindow, service: AutoUpdater }) {
  const { context, window, service } = params

  const log = useLogg('auto-updater-service').useGlobalConfig()

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
    defineInvokeHandler(context, autoUpdaterEventa.quitAndInstall, async () => {
      await service.quitAndInstall()
    }),
  )

  const cleanup = () => {
    for (const fn of cleanups)
      fn()
  }

  window.on('closed', cleanup)
  return cleanup
}
