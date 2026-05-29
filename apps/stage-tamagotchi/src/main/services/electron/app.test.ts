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
