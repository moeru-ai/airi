import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { WidgetsWindowManager } from '../../widgets'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setupWidgetsWindowInvokes } from './index.electron'

const disposeMock = vi.hoisted(() => vi.fn())
const createContextMock = vi.hoisted(() => vi.fn(() => ({ context: { id: 'widgets-test' }, dispose: disposeMock })))
const setupBaseWindowElectronInvokesMock = vi.hoisted(() => vi.fn())
const createWidgetsServiceMock = vi.hoisted(() => vi.fn())
const ipcMainMock = vi.hoisted(() => ({ setMaxListeners: vi.fn() }))

vi.mock('@moeru/eventa/adapters/electron/main', () => ({
  createContext: createContextMock,
}))

vi.mock('electron', () => ({
  ipcMain: ipcMainMock,
}))

vi.mock('../../shared/window', () => ({
  setupBaseWindowElectronInvokes: setupBaseWindowElectronInvokesMock,
}))

vi.mock('../../../services/airi/widgets', () => ({
  createWidgetsService: createWidgetsServiceMock,
}))

describe('setupWidgetsWindowInvokes', () => {
  const widgetWindow = {} as BrowserWindow
  const widgetsManager = {} as WidgetsWindowManager
  const serverChannel = {} as ServerChannel
  const i18n = {} as I18n

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('awaits base window electron invokes and returns dispose', async () => {
    let resolveBaseSetup!: () => void
    const baseSetupPromise = new Promise<void>((resolve) => {
      resolveBaseSetup = resolve
    })
    setupBaseWindowElectronInvokesMock.mockReturnValue(baseSetupPromise)
    createWidgetsServiceMock.mockReturnValue(undefined)

    const invokesPromise = setupWidgetsWindowInvokes({
      widgetWindow,
      widgetsManager,
      serverChannel,
      i18n,
    })

    expect(ipcMainMock.setMaxListeners).toHaveBeenCalledWith(0)
    expect(createContextMock).toHaveBeenCalledTimes(1)
    expect(setupBaseWindowElectronInvokesMock).toHaveBeenCalledTimes(1)
    expect(createWidgetsServiceMock).not.toHaveBeenCalled()

    resolveBaseSetup()
    const dispose = await invokesPromise

    expect(createWidgetsServiceMock).toHaveBeenCalledTimes(1)
    expect(dispose).toBe(disposeMock)
    expect(disposeMock).not.toHaveBeenCalled()
  })

  it('calls dispose and rethrows when base window setup rejects', async () => {
    const error = new Error('base window setup failed')
    setupBaseWindowElectronInvokesMock.mockRejectedValue(error)

    await expect(setupWidgetsWindowInvokes({
      widgetWindow,
      widgetsManager,
      serverChannel,
      i18n,
    })).rejects.toThrow('base window setup failed')

    expect(disposeMock).toHaveBeenCalledTimes(1)
    expect(createWidgetsServiceMock).not.toHaveBeenCalled()
  })

  it('calls dispose and rejects when widget window closes during setup', async () => {
    let closedCallback: (() => void) | undefined
    const mockWindow = {
      isDestroyed: vi.fn(() => false),
      once: vi.fn((event: string, callback: () => void) => {
        if (event === 'closed') {
          closedCallback = callback
        }
      }),
      removeListener: vi.fn(),
    } as never

    const baseSetupPromise = new Promise<void>(() => {})
    setupBaseWindowElectronInvokesMock.mockReturnValue(baseSetupPromise)

    const invokesPromise = setupWidgetsWindowInvokes({
      widgetWindow: mockWindow,
      widgetsManager,
      serverChannel,
      i18n,
    })

    expect(createWidgetsServiceMock).not.toHaveBeenCalled()

    closedCallback?.()

    await expect(invokesPromise).rejects.toThrow('Widget window was closed during setup')
    expect(disposeMock).toHaveBeenCalledTimes(1)
    expect(createWidgetsServiceMock).not.toHaveBeenCalled()
  })
})
