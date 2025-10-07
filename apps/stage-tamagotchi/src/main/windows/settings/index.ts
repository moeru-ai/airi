import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BrowserWindow, shell } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, load, withHashRoute } from '../../libs/electron/location'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function setupSettingsWindow() {
  const window = new BrowserWindow({
    title: 'Settings',
    width: 600.0,
    height: 800.0,
    show: false,
    icon,
    webPreferences: {
      preload: join(dirname(fileURLToPath(import.meta.url)), '../preload/index.mjs'),
      sandbox: false,
    },
  })

  window.on('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  await load(window, withHashRoute(baseUrl(resolve(__dirname, '..', '..', 'renderer')), '/settings'))

  return window
}
