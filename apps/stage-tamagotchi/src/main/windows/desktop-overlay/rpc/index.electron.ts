/**
 * Desktop Overlay Window — Electron RPC bootstrap
 *
 * Minimal eventa context setup for the overlay BrowserWindow.
 * Only registers base window services and MCP tool services —
 * the overlay only needs callTool/listTools for polling
 * `computer_use::desktop_get_state`.
 *
 * Follows the same pattern as main/chat/settings window RPC setups.
 */

import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { McpStdioManager } from '../../../services/airi/mcp-servers'
import type { DesktopOverlayReadiness } from './contracts'

import { createContext, handle } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { createMcpServersService } from '../../../services/airi/mcp-servers'
import { setupBaseWindowElectronInvokes } from '../../shared/window'
import { getDesktopOverlayReadinessContract } from './contracts'

export async function setupDesktopOverlayElectronInvokes(params: {
  window: BrowserWindow
  mcpStdioManager: McpStdioManager
  serverChannel: ServerChannel
  i18n: I18n
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.window)

  let readiness: DesktopOverlayReadiness = { state: 'booting' }

  handle(context, getDesktopOverlayReadinessContract, async () => {
    return readiness
  })

  try {
    await setupBaseWindowElectronInvokes({ context, window: params.window, i18n: params.i18n, serverChannel: params.serverChannel })
    createMcpServersService({ context, manager: params.mcpStdioManager })
    readiness = { state: 'ready' }
  }
  catch (error) {
    readiness = {
      state: 'degraded',
      error: error instanceof Error ? error.message : String(error),
    }
    // We intentionally don't throw here so the window still opens and
    // the renderer gracefully detects the degraded state via polling.
  }
}
