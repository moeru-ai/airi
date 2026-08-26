import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { McpStdioManager } from '../../services/airi/mcp-servers'
import type { WidgetsWindowManager } from '../widgets'

import { join, resolve } from 'node:path'

import { BrowserWindow } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { protectPrivilegedWindowNavigation } from '../shared'
import { setupChatWindowElectronInvokes } from './rpc/index.electron'

export function setupChatWindowReusableFunc(params: {
  i18n: I18n
  mcpStdioManager: McpStdioManager
  serverChannel: ServerChannel
  widgetsManager: WidgetsWindowManager
}) {
  return createReusableWindow(async () => {
    const window = new BrowserWindow({
      height: 800.0,
      icon,
      show: false,
      title: 'Chat',
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
      width: 600.0,
    })

    window.on('ready-to-show', () => window.show())
    protectPrivilegedWindowNavigation(window)

    await setupChatWindowElectronInvokes({
      i18n: params.i18n,
      mcpStdioManager: params.mcpStdioManager,
      serverChannel: params.serverChannel,
      widgetsManager: params.widgetsManager,
      window,
    })

    await load(window, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/chat', {
      query: {
        'stage-runtime': 'minimal',
        'synced-leader': 'false',
      },
    }))

    return window
  }).getWindow
}
