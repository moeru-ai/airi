import { createContext, defineInvoke } from '@moeru/eventa'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { electronAppOpenUserDataFolder } from '../../../shared/eventa'
import { createAppService } from './app'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
  quit: vi.fn(),
}))

const shellMock = vi.hoisted(() => ({
  openPath: vi.fn(),
}))

vi.mock('electron', () => ({
  app: appMock,
  shell: shellMock,
}))

vi.mock('std-env', () => ({
  isLinux: false,
  isMacOS: false,
  isWindows: true,
}))

describe('createAppService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createWindow(webContentsId: number) {
    return {
      webContents: { id: webContentsId },
    }
  }

  function invokeAsRenderer<TResult>(invoke: unknown, senderId: number): Promise<TResult> {
    if (typeof invoke !== 'function') {
      throw new TypeError('Expected an Eventa invoke function.')
    }

    return Reflect.apply(invoke, undefined, [undefined, {
      raw: {
        ipcMainEvent: { sender: { id: senderId } },
      },
    }]) as Promise<TResult>
  }

  it('opens the Electron userData folder and returns its path', async () => {
    const context = createContext()
    appMock.getPath.mockReturnValue('/tmp/airi-user-data')
    shellMock.openPath.mockResolvedValue('')

    createAppService({ context: context as never, window: createWindow(42) as never })

    const openUserDataFolder = defineInvoke(context, electronAppOpenUserDataFolder)

    await expect(invokeAsRenderer(openUserDataFolder, 42)).resolves.toEqual({ path: '/tmp/airi-user-data' })
    expect(appMock.getPath).toHaveBeenCalledWith('userData')
    expect(shellMock.openPath).toHaveBeenCalledWith('/tmp/airi-user-data')
  })

  it('ignores an open-folder request from another Electron window', async () => {
    // ROOT CAUSE:
    //
    // Each Electron window owns an Eventa context on the same ipcMain channel.
    // One renderer request reaches every context, so every app service opened
    // the folder before the handler checked the sender window.
    const context = createContext()
    appMock.getPath.mockReturnValue('/tmp/airi-user-data')
    shellMock.openPath.mockResolvedValue('')

    createAppService({ context: context as never, window: createWindow(7) as never })

    const openUserDataFolder = defineInvoke(context, electronAppOpenUserDataFolder)

    await expect(invokeAsRenderer(openUserDataFolder, 42)).resolves.toBeUndefined()
    expect(appMock.getPath).not.toHaveBeenCalled()
    expect(shellMock.openPath).not.toHaveBeenCalled()
  })

  it('throws when Electron fails to open the userData folder', async () => {
    const context = createContext()
    appMock.getPath.mockReturnValue('/tmp/airi-user-data')
    shellMock.openPath.mockResolvedValue('Failed to open path')

    createAppService({ context: context as never, window: createWindow(42) as never })

    const openUserDataFolder = defineInvoke(context, electronAppOpenUserDataFolder)

    await expect(invokeAsRenderer(openUserDataFolder, 42)).rejects.toThrow('Failed to open path')
    expect(appMock.getPath).toHaveBeenCalledWith('userData')
    expect(shellMock.openPath).toHaveBeenCalledWith('/tmp/airi-user-data')
  })
})
