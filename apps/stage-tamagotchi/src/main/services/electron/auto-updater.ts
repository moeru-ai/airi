import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'
import type { UpdateInfo } from 'electron-updater'

import type { AutoUpdaterState } from '../../../shared/eventa'

import electronUpdater from 'electron-updater'

import { is } from '@electron-toolkit/utils'
import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { committerDate } from '~build/git'
import { app } from 'electron'
import { Semaphore } from 'es-toolkit'

import {
  autoUpdater as autoUpdaterEventa,
  electronAutoUpdaterStateChanged,
} from '../../../shared/eventa'
import { MockAutoUpdater } from './mock-auto-updater'

export interface AppUpdaterLike {
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

export function setupAutoUpdater(): AutoUpdater {
  const semaphore = new Semaphore(1)

  const log = useLogg('auto-updater').useGlobalConfig()
  const autoUpdater = fromImported()

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

    try {
      context.emit(electronAutoUpdaterStateChanged, state)
    }
    catch {}
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
