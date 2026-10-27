import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { AutoUpdater } from '../../services/electron/auto-updater'

import { BrowserWindow } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getPreloadPath, getRendererRoot, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { protectPrivilegedWindowNavigation } from '../shared'
import { setupAboutWindowElectronInvokes } from './rpc/index.electron'

export function setupAboutWindowReusable(params: {
  autoUpdater: AutoUpdater
  i18n: I18n
  serverChannel: ServerChannel
}) {
  return createReusableWindow(async () => {
    const window = new BrowserWindow({
      title: 'About AIRI',
      width: 670,
      height: 880,
      show: false,
      resizable: true,
      maximizable: false,
      minimizable: false,
      icon,
      webPreferences: {
        preload: getPreloadPath(),
        sandbox: false,
      },
    })

    window.on('ready-to-show', () => window.show())
    protectPrivilegedWindowNavigation(window)

    await setupAboutWindowElectronInvokes({
      window,
      autoUpdater: params.autoUpdater,
      i18n: params.i18n,
      serverChannel: params.serverChannel,
    })

    await load(window, withHashRoute(baseUrl(getRendererRoot()), '/about', {
      query: { 'synced-leader': 'false' },
    }))

    return window
  }).getWindow
}
