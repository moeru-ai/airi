import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { McpStdioManager } from '../../../services/airi/mcp-servers'
import type { WidgetsWindowManager } from '../../widgets'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { electronOpenMainDevtools } from '../../../../shared/eventa'
import { createMcpServersService } from '../../../services/airi/mcp-servers'
import { createWidgetsService } from '../../../services/airi/widgets'
import { setupBaseWindowElectronInvokes } from '../../shared/window'

export async function setupChatWindowElectronInvokes(params: {
  window: BrowserWindow
  widgetsManager: WidgetsWindowManager
  serverChannel: ServerChannel
  mcpStdioManager: McpStdioManager
  i18n: I18n
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

  await setupBaseWindowElectronInvokes({ context, window: params.window, i18n: params.i18n, serverChannel: params.serverChannel })

  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.window })
<<<<<<< HEAD
  createMcpServersService({ context, manager: params.mcpStdioManager })
=======
  createServerChannelService({ serverChannel: params.serverChannel })
  createMcpServersService({ context, manager: params.mcpStdioManager, allowManageConfig: false })
>>>>>>> a2b253a9 (tmp commit)

  defineInvokeHandler(context, electronOpenMainDevtools, () => params.window.webContents.openDevTools({ mode: 'detach' }))
}
