import type { ElectronMainContextExtensions, ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { McpStdioManager } from '../../../services/airi/mcp-servers'
import type { WidgetsWindowManager } from '../../widgets'

import { createContext, defineInvoke } from '@moeru/eventa'
import { BrowserWindow } from 'electron'
import { expect, it, vi } from 'vitest'

import { electronOpenMainDevtools, electronOpenSettings } from '../../../../shared/eventa'
import { createMcpServersService } from '../../../services/airi/mcp-servers'
import { createWidgetsService } from '../../../services/airi/widgets'
import { setupBaseWindowElectronInvokes } from '../../shared/window'
import { setupChatWindowElectronInvokes } from './index.electron'

vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents = { openDevTools: vi.fn() }
  },
}))

vi.mock('../../../services/airi/mcp-servers', () => ({
  createMcpServersService: vi.fn(),
}))

vi.mock('../../../services/airi/widgets', () => ({
  createWidgetsService: vi.fn(),
}))

vi.mock('../../shared/window', () => ({
  setupBaseWindowElectronInvokes: vi.fn(),
}))

// ROOT CAUSE:
// The merge recreated an Electron context after chat windows began to supply their own.
// Register services and devtools on the supplied context to preserve window ownership.
it('registers chat invokes on each supplied window context', async () => {
  const firstContext = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
  const secondContext = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
  const firstWindow = new BrowserWindow()
  const secondWindow = new BrowserWindow()
  const firstOpenDevTools = vi.mocked(firstWindow.webContents.openDevTools)
  const secondOpenDevTools = vi.mocked(secondWindow.webContents.openDevTools)
  const openSettingsWindow = vi.fn()
  const services = {
    widgetsManager: {} as WidgetsWindowManager,
    serverChannel: {} as ServerChannel,
    mcpStdioManager: {} as McpStdioManager,
    i18n: {} as I18n,
    openSettingsWindow,
  }

  await setupChatWindowElectronInvokes({ ...services, context: firstContext, window: firstWindow })
  await setupChatWindowElectronInvokes({ ...services, context: secondContext, window: secondWindow })

  expect(setupBaseWindowElectronInvokes).toHaveBeenCalledWith({
    context: firstContext,
    window: firstWindow,
    i18n: services.i18n,
    serverChannel: services.serverChannel,
  })
  expect(createWidgetsService).toHaveBeenCalledWith({
    context: firstContext,
    widgetsManager: services.widgetsManager,
    window: firstWindow,
  })
  expect(createMcpServersService).toHaveBeenCalledWith({ context: firstContext, manager: services.mcpStdioManager })

  await defineInvoke(firstContext, electronOpenMainDevtools)()
  expect(firstOpenDevTools).toHaveBeenCalledWith({ mode: 'detach' })
  expect(secondOpenDevTools).not.toHaveBeenCalled()

  await defineInvoke(secondContext, electronOpenMainDevtools)()
  expect(secondOpenDevTools).toHaveBeenCalledWith({ mode: 'detach' })
  expect(firstOpenDevTools).toHaveBeenCalledTimes(1)

  await defineInvoke(firstContext, electronOpenSettings)({ route: 'system' })
  expect(openSettingsWindow).toHaveBeenCalledWith('system')

  await defineInvoke(secondContext, electronOpenSettings)({})
  expect(openSettingsWindow).toHaveBeenLastCalledWith(undefined)
})
