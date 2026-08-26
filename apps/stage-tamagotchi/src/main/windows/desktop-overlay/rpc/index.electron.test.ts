import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { McpStdioManager } from '../../../services/airi/mcp-servers'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setupDesktopOverlayElectronInvokes } from './index.electron'

const defineInvokeHandlerMock = vi.hoisted(() => vi.fn())
const createContextMock = vi.hoisted(() => vi.fn(() => ({ context: { id: 'desktop-overlay-test' } })))
const setupBaseWindowElectronInvokesMock = vi.hoisted(() => vi.fn())
const createMcpServersServiceMock = vi.hoisted(() => vi.fn())
const ipcMainMock = vi.hoisted(() => ({ setMaxListeners: vi.fn() }))

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: defineInvokeHandlerMock,
  }
})

vi.mock('@moeru/eventa/adapters/electron/main', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa/adapters/electron/main')>()
  return {
    ...actual,
    createContext: createContextMock,
  }
})

vi.mock('electron', () => ({
  ipcMain: ipcMainMock,
}))

vi.mock('../../shared/window', () => ({
  setupBaseWindowElectronInvokes: setupBaseWindowElectronInvokesMock,
}))

vi.mock('../../../services/airi/mcp-servers', () => ({
  createMcpServersService: createMcpServersServiceMock,
}))

describe('setupDesktopOverlayElectronInvokes', () => {
  const window = {} as BrowserWindow
  const mcpStdioManager = {} as McpStdioManager
  const serverChannel = {} as ServerChannel
  const i18n = {} as I18n

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('publishes ready after the base window invokes and MCP services are wired', async () => {
    let readinessHandler: (() => Promise<{ state: 'booting' | 'ready' | 'degraded', error?: string }>) | undefined

    defineInvokeHandlerMock.mockImplementation((_context, _contract, handler) => {
      readinessHandler = handler
    })
    setupBaseWindowElectronInvokesMock.mockResolvedValue(undefined)
    createMcpServersServiceMock.mockReturnValue(undefined)

    await setupDesktopOverlayElectronInvokes({
      window,
      mcpStdioManager,
      serverChannel,
      i18n,
    })

    expect(ipcMainMock.setMaxListeners).toHaveBeenCalledWith(0)
    expect(createContextMock).toHaveBeenCalledTimes(1)
    expect(setupBaseWindowElectronInvokesMock).toHaveBeenCalledTimes(1)
    expect(createMcpServersServiceMock).toHaveBeenCalledTimes(1)
    expect(readinessHandler).toBeDefined()
    await expect(readinessHandler!()).resolves.toEqual({ state: 'ready' })
  })

  it('publishes degraded when the base window invokes fail', async () => {
    let readinessHandler: (() => Promise<{ state: 'booting' | 'ready' | 'degraded', error?: string }>) | undefined

    defineInvokeHandlerMock.mockImplementation((_context, _contract, handler) => {
      readinessHandler = handler
    })
    setupBaseWindowElectronInvokesMock.mockRejectedValueOnce(new Error('boom'))

    await setupDesktopOverlayElectronInvokes({
      window,
      mcpStdioManager,
      serverChannel,
      i18n,
    })

    expect(createMcpServersServiceMock).not.toHaveBeenCalled()
    expect(readinessHandler).toBeDefined()
    await expect(readinessHandler!()).resolves.toEqual({ state: 'degraded', error: 'boom' })
  })
})
