import type { LauncherEvent, Updater, UpdaterStatus } from '@ergosphere-it/electron/main'

import { defineInvoke } from '@moeru/eventa'
import { autoUpdater as autoUpdaterEventa } from '@proj-airi/electron-eventa/electron-updater'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createWindowIpc } from '../../libs/electron/testing/window-ipc'
import { createWindowContext } from '../../libs/electron/window-context'

const bundleState = vi.hoisted(() => ({
  version: '0.9.0-beta.4',
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    app: { getPath: (name: string) => `/tmp/${name}` },
    ipcMain: new EventEmitter(),
  }
})

vi.mock('@ergosphere-it/electron/main', () => ({
  activeBundle: {
    fromInstaller: true,
    releaseId: 1775000000000,
    get version() {
      return bundleState.version
    },
  },
  updater: undefined,
}))

vi.mock('std-env', () => ({
  isWindows: false,
}))

vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: () => ({
    useGlobalConfig: () => ({
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      withError: () => ({
        error: vi.fn(),
      }),
    }),
  }),
}))

const update = { fromInstaller: false, releaseId: 1776000000000, requires: 'restart', version: '0.9.0-beta.6' } as const

/** An ergosphere-it updater that a test drives with `setStatus`. */
function createFakeUpdater(initial: UpdaterStatus = { status: 'idle' }) {
  let status = initial
  let channel = 'stable'
  let autoDownload = true
  const statusListeners = new Set<(status: UpdaterStatus) => void>()
  const eventListeners = new Set<(event: LauncherEvent) => void>()
  const setChannel = vi.fn((next: string) => {
    channel = next
  })
  const setAutoDownload = vi.fn((next: boolean) => {
    autoDownload = next
  })

  const updater = {
    applyUpdate: vi.fn().mockResolvedValue(undefined),
    get autoDownload() {
      return autoDownload
    },
    set autoDownload(next) {
      setAutoDownload(next)
    },
    get channel() {
      return channel
    },
    set channel(next) {
      setChannel(next)
    },
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    cohorts: [],
    delayHealthCheck: vi.fn(),
    dismissRollback: vi.fn().mockResolvedValue(undefined),
    downloadUpdate: vi.fn(async () => status),
    markBundleHealthy: vi.fn(),
    onBundleChange: vi.fn(() => () => {}),
    onEvent: vi.fn((listener: (event: LauncherEvent) => void) => {
      eventListeners.add(listener)
      return () => eventListeners.delete(listener)
    }),
    onStatus: vi.fn((listener: (status: UpdaterStatus) => void) => {
      statusListeners.add(listener)
      listener(status)
      return () => statusListeners.delete(listener)
    }),
    get status() {
      return status
    },
  } satisfies Updater

  return {
    updater,
    setAutoDownload,
    setChannel,
    setStatus(next: UpdaterStatus) {
      status = next
      for (const listener of statusListeners)
        listener(next)
    },
  }
}

describe('setupAutoUpdater', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('AIRI_UPDATE_CHANNEL', undefined)
    bundleState.version = '0.9.0-beta.4'
  })

  it.each([
    { name: 'a check', status: { status: 'checking' }, expected: { status: 'checking' } },
    { name: 'an update that waits for a download', status: { status: 'available', update }, expected: { status: 'available', info: { version: '0.9.0-beta.6' } } },
    { name: 'no update', status: { status: 'up-to-date' }, expected: { status: 'not-available', info: { version: '0.9.0-beta.4' } } },
    { name: 'a download', status: { status: 'downloading', bytesPerSecond: 524_288, downloadedBytes: 4_200_000, percent: 42, totalBytes: 10_000_000, update }, expected: { status: 'downloading', info: { version: '0.9.0-beta.6' }, progress: { bytesPerSecond: 524_288, percent: 42, total: 10_000_000, transferred: 4_200_000 } } },
    { name: 'a patch after a download', status: { status: 'preparing', percent: 70, update }, expected: { status: 'downloading', progress: { bytesPerSecond: 0, percent: 70 } } },
    { name: 'a version that needs a manual install', status: { status: 'manual-install-required', update: { ...update, requires: 'install' } }, expected: { status: 'manual-install-required', info: { version: '0.9.0-beta.6' } } },
    { name: 'a ready update', status: { status: 'ready', update }, expected: { status: 'downloaded', info: { version: '0.9.0-beta.6', releaseDate: new Date(update.releaseId).toISOString() } } },
    { name: 'a failed download', status: { status: 'download-failed', error: { code: 'download-failed', message: 'Socket closed.' }, retryAt: '2026-10-26T00:00:00.000Z', update }, expected: { status: 'error' } },
    { name: 'a bad signature', status: { status: 'verification-failed', error: { code: 'invalid-signature', message: 'Bad signature.' } }, expected: { status: 'error', error: { message: 'Bad signature.' } } },
    { name: 'turned off updates', status: { status: 'disabled', reason: 'store-build' }, expected: { status: 'disabled' } },
  ] satisfies Array<{ name: string, status: UpdaterStatus, expected: object }>)('shows $name to the renderer', async ({ status, expected }) => {
    const fake = createFakeUpdater()
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater })

    fake.setStatus(status)

    expect(service.state).toMatchObject(expected)
  })

  it.each([
    { name: 'the lane that the user chose', stored: 'nightly', env: undefined, expected: 'nightly' },
    { name: 'AIRI_UPDATE_CHANNEL', stored: 'nightly', env: 'dev', expected: 'dev' },
  ] as const)('follows $name', async ({ stored, env, expected }) => {
    if (env)
      vi.stubEnv('AIRI_UPDATE_CHANNEL', env)
    const fake = createFakeUpdater()
    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater({ updater: fake.updater, getStoredUpdateLane: () => stored })

    expect(fake.updater.channel).toBe(expected)
  })

  // A test build follows a channel such as `ota-test` from `ergo.config.ts`, and its version names no lane.
  it('keeps the channel of the build when nobody chose a lane', async () => {
    bundleState.version = '0.12.0-ota.1'
    const fake = createFakeUpdater()
    fake.updater.channel = 'ota-test'
    fake.setChannel.mockClear()
    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater({ updater: fake.updater })

    expect(fake.setChannel).not.toHaveBeenCalled()
    expect(fake.updater.channel).toBe('ota-test')
  })

  it.each([
    { saved: 'latest', version: '0.13.1-dev.821.13eef81', expected: 'dev' },
    { saved: 'beta', version: '0.14.0-rc.1', expected: 'canary' },
  ])('leaves the removed channel $saved that the launcher saved, for the channel of $version', async ({ saved, version, expected }) => {
    bundleState.version = version
    const fake = createFakeUpdater()
    fake.updater.channel = saved
    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater({ updater: fake.updater })

    expect(fake.updater.channel).toBe(expected)
  })

  it('switches the channel, saves the choice, and checks again when the user picks a lane', async () => {
    const fake = createFakeUpdater()
    const setStoredUpdateLane = vi.fn()
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater, setStoredUpdateLane })

    await service.setPreferredUpdateLane('nightly')

    expect(fake.updater.channel).toBe('nightly')
    expect(setStoredUpdateLane).toHaveBeenCalledWith('nightly')
    expect(fake.updater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(service.getPreferredUpdateLane()).toBe('nightly')
  })

  it.each([
    { version: '0.9.0-beta.4', expected: 'canary' },
    { version: '0.13.1-nightly.12.13eef81', expected: 'nightly' },
    { version: '0.13.1-dev.821.13eef81', expected: 'dev' },
    { version: '0.13.0', expected: 'stable' },
  ])('goes back to the channel of $version when the user picks auto', async ({ version, expected }) => {
    bundleState.version = version
    const fake = createFakeUpdater()
    fake.updater.channel = 'canary'
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater, getStoredUpdateLane: () => 'dev' })

    await service.setPreferredUpdateLane(undefined)

    expect(fake.updater.channel).toBe(expected)
  })

  it('downloads an available update when the user asks', async () => {
    const fake = createFakeUpdater({ status: 'available', update })
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater })

    await service.downloadUpdate()

    expect(fake.updater.downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('reports a failed download start', async () => {
    const fake = createFakeUpdater({ status: 'available', update })
    fake.updater.downloadUpdate.mockRejectedValueOnce(new Error('No space left.'))
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater })

    await service.downloadUpdate()

    expect(service.state).toMatchObject({ status: 'error', error: { message: 'No space left.' } })
  })

  it('saves the download preference and the lane from one renderer request', async () => {
    const { ipcMain } = await import('electron')
    const { electronGetUpdaterPreferences, electronSetUpdaterPreferences } = await import('../../../shared/eventa')
    const fake = createFakeUpdater()
    const setStoredUpdateLane = vi.fn()
    const { createAutoUpdaterService, setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater, setStoredUpdateLane })
    const { context, window } = createWindowIpc(ipcMain)
    createAutoUpdaterService({ context: createWindowContext(window).context, window, service })

    const saved = await defineInvoke(context, electronSetUpdaterPreferences)({ autoDownload: false, channel: 'nightly' })

    expect(saved).toEqual({ autoDownload: false, channel: 'nightly' })
    expect(fake.setAutoDownload).toHaveBeenCalledWith(false)
    expect(setStoredUpdateLane).toHaveBeenCalledWith('nightly')
    expect(await defineInvoke(context, electronGetUpdaterPreferences)()).toEqual({ autoDownload: false, channel: 'nightly' })
  })

  it('applies a ready update once while two clicks arrive at once', async () => {
    const fake = createFakeUpdater({ status: 'ready', update })
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater })

    await Promise.all([service.quitAndInstall(), service.quitAndInstall()])

    expect(fake.updater.applyUpdate).toHaveBeenCalledTimes(1)
  })

  // A page-only update reloaded the windows in place and kept the app. The next update that needed a restart did
  // nothing when clicked, because the service took the first apply for the last one.
  it('applies the next update after an update reloaded the windows in place', async () => {
    const fake = createFakeUpdater({ status: 'ready', update: { ...update, requires: 'reload' } })
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater })

    await service.quitAndInstall()
    fake.setStatus({ status: 'ready', update })
    await service.quitAndInstall()

    expect(fake.updater.applyUpdate).toHaveBeenCalledTimes(2)
  })

  it('reports healthy once main is ready and the main window mounted its page, and again after a reload', async () => {
    const fake = createFakeUpdater({ status: 'up-to-date' })
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater })

    service.markMainPageMounted()
    expect(fake.updater.markBundleHealthy).not.toHaveBeenCalled()
    service.markMainReady()
    expect(fake.updater.markBundleHealthy).toHaveBeenCalledTimes(1)
    // A page-only update reloads the page, and it mounts again.
    service.markMainPageMounted()
    expect(fake.updater.markBundleHealthy).toHaveBeenCalledTimes(2)
  })

  it('does not report health while main has not started', async () => {
    const fake = createFakeUpdater({ status: 'up-to-date' })
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater })

    service.markMainPageMounted()
    service.markMainPageMounted()

    expect(fake.updater.markBundleHealthy).not.toHaveBeenCalled()
  })

  it('applies nothing while no update is ready', async () => {
    const fake = createFakeUpdater({ status: 'up-to-date' })
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater })

    await service.quitAndInstall()

    expect(fake.updater.applyUpdate).not.toHaveBeenCalled()
  })

  it('reports a failed apply and lets the user try again', async () => {
    const fake = createFakeUpdater({ status: 'ready', update })
    fake.updater.applyUpdate.mockRejectedValueOnce(new Error('The installer did not start.'))
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater })

    await service.quitAndInstall()
    expect(service.state).toMatchObject({ status: 'error', error: { message: 'The installer did not start.' } })

    await service.quitAndInstall()
    expect(fake.updater.applyUpdate).toHaveBeenCalledTimes(2)
  })

  it('dismisses a rollback, because the app runs a bundle that works', async () => {
    const fake = createFakeUpdater()
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater })

    fake.setStatus({
      status: 'rolled-back',
      reason: 'not-marked-healthy',
      from: { fromInstaller: false, releaseId: 1776000000000, version: '0.9.0-beta.6' },
      to: { fromInstaller: true, releaseId: 1775000000000, version: '0.9.0-beta.4' },
    })

    expect(fake.updater.dismissRollback).toHaveBeenCalledTimes(1)
    expect(service.state.status).toBe('not-available')
  })

  // An install with its own user data directory, for example a test build, must not write into the log of another install.
  it('writes the updater log in the user data directory and reports that path', async () => {
    const { appendFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const fake = createFakeUpdater()
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater })
    const logFile = join('/tmp/userData', 'logs', 'updater-log.txt')

    fake.setStatus({ status: 'error', error: { code: 'network-error', message: 'Offline.' } })

    await vi.waitFor(() => expect(appendFile).toHaveBeenCalledWith(logFile, expect.stringContaining('network-error')))
    expect(service.state.diagnostics?.logFilePath).toBe(logFile)
  })

  it('does not touch the updater when the launcher turned it off', async () => {
    const fake = createFakeUpdater({ status: 'disabled', reason: 'store-build' })
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater })

    await service.checkForUpdates()
    await service.setPreferredUpdateLane('nightly')
    service.setAutoDownload(false)

    expect(fake.setChannel).not.toHaveBeenCalled()
    expect(fake.setAutoDownload).not.toHaveBeenCalled()
    expect(fake.updater.checkForUpdates).not.toHaveBeenCalled()
    expect(service.state.status).toBe('disabled')
  })

  it('serves the disabled contract without the updater for an install that a store updates', async () => {
    const fake = createFakeUpdater()
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ enabled: false, updater: fake.updater })

    await service.checkForUpdates()

    expect(service.state.status).toBe('disabled')
    expect(fake.updater.onStatus).not.toHaveBeenCalled()
  })

  // One click checked once per open window. Each window context heard the IPC of all windows.
  //
  // We fixed this with window contexts that hear only their own window (`createWindowContext`).
  it('checks once when the main, settings, and about windows are open and one window requests a check', async () => {
    const { ipcMain } = await import('electron')
    const fake = createFakeUpdater()
    const { createAutoUpdaterService, setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater({ updater: fake.updater })
    const windows = [createWindowIpc(ipcMain), createWindowIpc(ipcMain), createWindowIpc(ipcMain)]
    for (const { window } of windows)
      createAutoUpdaterService({ context: createWindowContext(window).context, window, service })

    await defineInvoke(windows[1].context, autoUpdaterEventa.checkForUpdates)()

    expect(fake.updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'a Flatpak sandbox', env: { FLATPAK_ID: 'ai.moeru.airi' }, externallyUpdated: true },
    { name: 'a Steam build', env: { VITE_DISTRIBUTION: 'steam' }, externallyUpdated: true },
    { name: 'a Nix package', env: { AIRI_DISTRIBUTION: 'nix' }, externallyUpdated: true },
    { name: 'a direct download', env: {}, externallyUpdated: false },
  ])('reports whether a store or a package manager updates $name', async ({ env, externallyUpdated }) => {
    vi.stubEnv('FLATPAK_ID', undefined)
    vi.stubEnv('VITE_DISTRIBUTION', undefined)
    vi.stubEnv('AIRI_DISTRIBUTION', undefined)
    for (const [key, value] of Object.entries(env))
      vi.stubEnv(key, value)

    const { isExternallyUpdatedInstall } = await import('./auto-updater')

    expect(isExternallyUpdatedInstall()).toBe(externallyUpdated)
  })
})
