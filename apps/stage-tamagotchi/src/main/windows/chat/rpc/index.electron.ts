import type { BrowserWindow } from 'electron'

import type { ServerChannel } from '../../../services/airi/channel-server'
import type { McpStdioManager } from '../../../services/airi/mcp-servers'
import type { WidgetsWindowManager } from '../../widgets'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { electronOpenMainDevtools } from '../../../../shared/eventa'
import { createServerChannelService } from '../../../services/airi/channel-server'
import { createMcpServersService } from '../../../services/airi/mcp-servers'
import { createWidgetsService } from '../../../services/airi/widgets'
import { createScreenService, createWindowService } from '../../../services/electron'

export function setupChatWindowElectronInvokes(params: {
  window: BrowserWindow
  widgetsManager: WidgetsWindowManager
  serverChannel: ServerChannel
  mcpStdioManager: McpStdioManager
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.window, {
    // NOTICE: eventa main adapter listens on process-wide ipcMain channel.
    // Restrict invoke routing to the sender window to avoid duplicate handler execution
    // when multiple windows register handlers for the same invoke event.
    onlySameWindow: true,
  })

  createScreenService({ context, window: params.window })
  createWindowService({ context, window: params.window })
  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.window })
  createServerChannelService({ serverChannel: params.serverChannel })
  createMcpServersService({ context, manager: params.mcpStdioManager, allowManageConfig: false })

  defineInvokeHandler(context, electronOpenMainDevtools, () => params.window.webContents.openDevTools({ mode: 'detach' }))
}
