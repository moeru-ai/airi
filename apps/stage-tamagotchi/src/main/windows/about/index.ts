import type { AutoUpdater } from '../../services/electron/auto-updater'

import { join, resolve } from 'node:path'

import { BrowserWindow, shell } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { setupAboutWindowElectronInvokes } from './rpc/index.electron'

export function setupAboutWindowReusable(params: { autoUpdater: AutoUpdater }) {
  return createReusableWindow(async () => {
    const window = new BrowserWindow({
      title: 'About AIRI',
      width: 670,
      height: 730,
      show: false,
      resizable: true,
      maximizable: false,
      minimizable: false,
      icon,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
      },
    })

    window.on('ready-to-show', () => window.show())
    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    await load(window, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/about'))

    setupAboutWindowElectronInvokes({ window, autoUpdater: params.autoUpdater })

    return window
  }).getWindow
}
