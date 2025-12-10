import { join, resolve } from 'node:path'

import { BrowserWindow, shell } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'

export function setupAboutWindowReusable() {
  return createReusableWindow(async () => {
    const window = new BrowserWindow({
      title: 'About AIRI',
      width: 580,
      height: 630,
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

    return window
  }).getWindow
}
