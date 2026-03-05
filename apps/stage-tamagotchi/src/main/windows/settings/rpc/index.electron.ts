import type { BrowserWindow } from 'electron'

import type { ServerChannel } from '../../../services/airi/channel-server'
import type { McpStdioManager } from '../../../services/airi/mcp-servers'
import type { AutoUpdater } from '../../../services/electron/auto-updater'
import type { DevtoolsWindowManager } from '../../devtools'
import type { WidgetsWindowManager } from '../../widgets'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { electronOpenDevtoolsWindow, electronOpenSettingsDevtools } from '../../../../shared/eventa'
import { createServerChannelService } from '../../../services/airi/channel-server'
import { createMcpServersService } from '../../../services/airi/mcp-servers'
import { createWidgetsService } from '../../../services/airi/widgets'
import { createAutoUpdaterService, createScreenService, createWindowService } from '../../../services/electron'

export async function setupSettingsWindowInvokes(params: {
  settingsWindow: BrowserWindow
  widgetsManager: WidgetsWindowManager
  autoUpdater: AutoUpdater
  devtoolsMarkdownStressWindow: DevtoolsWindowManager
  serverChannel: ServerChannel
  mcpStdioManager: McpStdioManager
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.settingsWindow, {
    // NOTICE: eventa main adapter listens on process-wide ipcMain channel.
    // Restrict invoke routing to the sender window to avoid duplicate handler execution
    // when multiple windows register handlers for the same invoke event.
    onlySameWindow: true,
  })

  createScreenService({ context, window: params.settingsWindow })
  createWindowService({ context, window: params.settingsWindow })
  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.settingsWindow })
  createAutoUpdaterService({ context, window: params.settingsWindow, service: params.autoUpdater })
  createServerChannelService({ serverChannel: params.serverChannel })
  createMcpServersService({ context, manager: params.mcpStdioManager, allowManageConfig: true })

  defineInvokeHandler(context, electronOpenSettingsDevtools, async () => params.settingsWindow.webContents.openDevTools({ mode: 'detach' }))
  defineInvokeHandler(context, electronOpenDevtoolsWindow, async (payload) => {
    await params.devtoolsMarkdownStressWindow.openWindow(payload?.route)
  })
}
