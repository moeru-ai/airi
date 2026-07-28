import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { McpStdioManager } from '../../../services/airi/mcp-servers'
import type { WidgetsWindowManager } from '../../widgets'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { electronOpenSettings } from '../../../../shared/eventa'
import { setupChatWindowElectronInvokes } from './index.electron'

const defineInvokeHandlerMock = vi.hoisted(() => vi.fn())
const createContextMock = vi.hoisted(() => vi.fn(() => ({ context: { id: 'chat-window-test' } })))
const setupBaseWindowElectronInvokesMock = vi.hoisted(() => vi.fn())
const createMcpServersServiceMock = vi.hoisted(() => vi.fn())
const createWidgetsServiceMock = vi.hoisted(() => vi.fn())
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

vi.mock('../../../services/airi/widgets', () => ({
  createWidgetsService: createWidgetsServiceMock,
}))

describe('setupChatWindowElectronInvokes', () => {
  const window = {} as BrowserWindow
  const widgetsManager = {} as WidgetsWindowManager
  const serverChannel = {} as ServerChannel
  const mcpStdioManager = {} as McpStdioManager
  const i18n = {} as I18n
  const openSettingsWindow = vi.fn<(route?: string) => Promise<void>>()

  beforeEach(() => {
    vi.clearAllMocks()
    openSettingsWindow.mockResolvedValue(undefined)
  })

  // ROOT CAUSE:
  //
  // The Provider recovery action runs inside the dedicated Chat renderer, but
  // that renderer's Eventa context did not register electronOpenSettings.
  // Handlers registered for the main and dashboard contexts cannot receive
  // invokes sent by the Chat window.
  //
  // We fixed this by passing the settings-window capability into the Chat
  // window setup and registering it on the Chat-specific Eventa context.
  it('opens Provider settings from the Chat window context', async () => {
    const params = {
      window,
      widgetsManager,
      serverChannel,
      mcpStdioManager,
      i18n,
      openSettingsWindow,
    }

    await setupChatWindowElectronInvokes(params)

    const registration = defineInvokeHandlerMock.mock.calls.find(([, contract]) => contract === electronOpenSettings)
    expect(registration).toBeDefined()

    const handler = registration?.[2]
    await handler?.({ route: '/settings/providers' })

    expect(openSettingsWindow).toHaveBeenCalledTimes(1)
    expect(openSettingsWindow).toHaveBeenCalledWith('/settings/providers')
  })
})
