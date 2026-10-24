import type { BrowserWindow } from 'electron'

import { EventEmitter } from 'node:events'

import { createContext, defineInvoke } from '@moeru/eventa'
import { createContext as createRendererContext } from '@moeru/eventa/adapters/electron/renderer'
import { ipcMain } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { electronAppGetVersion, electronAppOpenUserDataFolder } from '../../../shared/eventa'
import { createAppService, createAppVersionService } from './app'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
  getVersion: vi.fn(),
  quit: vi.fn(),
}))

const shellMock = vi.hoisted(() => ({
  openPath: vi.fn(),
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    app: appMock,
    ipcMain: new EventEmitter(),
    shell: shellMock,
  }
})

vi.mock('std-env', () => ({
  isLinux: false,
  isMacOS: false,
  isWindows: true,
}))

let nextWebContentsId = 1

function createWindowIpc() {
  const rendererIpc = new EventEmitter()
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    webContents: {
      id: nextWebContentsId++,
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) => rendererIpc.emit(channel, {}, payload),
    },
  })
  // The fake IPC objects carry only the members that the Eventa adapters call.
  const { context } = createRendererContext({
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      rendererIpc.on(channel, listener)
      return () => rendererIpc.off(channel, listener)
    },
    send: (channel: string, payload: unknown) => ipcMain.emit(channel, { sender: window.webContents }, payload),
  } as never)

  const browserWindow: BrowserWindow = window as never
  return { window: browserWindow, context }
}

describe('createAppService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the Electron userData folder and returns its path', async () => {
    const context = createContext()
    appMock.getPath.mockReturnValue('/tmp/airi-user-data')
    shellMock.openPath.mockResolvedValue('')

    createAppService({ context: context as never, window: {} as never })

    const openUserDataFolder = defineInvoke(context, electronAppOpenUserDataFolder)

    await expect(openUserDataFolder()).resolves.toEqual({ path: '/tmp/airi-user-data' })
    expect(appMock.getPath).toHaveBeenCalledWith('userData')
    expect(shellMock.openPath).toHaveBeenCalledWith('/tmp/airi-user-data')
  })

  it('throws when Electron fails to open the userData folder', async () => {
    const context = createContext()
    appMock.getPath.mockReturnValue('/tmp/airi-user-data')
    shellMock.openPath.mockResolvedValue('Failed to open path')

    createAppService({ context: context as never, window: {} as never })

    const openUserDataFolder = defineInvoke(context, electronAppOpenUserDataFolder)

    await expect(openUserDataFolder()).rejects.toThrow('Failed to open path')
    expect(appMock.getPath).toHaveBeenCalledWith('userData')
    expect(shellMock.openPath).toHaveBeenCalledWith('/tmp/airi-user-data')
  })
})

describe('createAppVersionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the packaged app version, not the version of the renderer build', async () => {
    appMock.getVersion.mockReturnValue('0.0.0-test.1')
    const { window, context } = createWindowIpc()
    createAppVersionService({ window })

    await expect(defineInvoke(context, electronAppGetVersion)()).resolves.toBe('0.0.0-test.1')
  })

  it('reads the version once when several windows are open and one window requests it', async () => {
    appMock.getVersion.mockReturnValue('0.12.0')
    const windows = [createWindowIpc(), createWindowIpc(), createWindowIpc()]
    for (const { window } of windows)
      createAppVersionService({ window })

    await defineInvoke(windows[1].context, electronAppGetVersion)()

    expect(appMock.getVersion).toHaveBeenCalledTimes(1)
  })
})
