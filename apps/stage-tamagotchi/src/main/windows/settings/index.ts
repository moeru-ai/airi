import { join, resolve } from 'node:path'

import { BrowserWindow, shell } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { setupSettingsWindowInvokes } from './rpc/index.electron'

export function setupSettingsWindowReusableFunc() {
  return createReusableWindow(async () => {
    const window = new BrowserWindow({
      title: 'Settings',
      width: 600.0,
      height: 800.0,
      show: false,
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

    await load(window, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/settings'))
    await setupSettingsWindowInvokes({ settingsWindow: window })

    return window
  }).getWindow
}
