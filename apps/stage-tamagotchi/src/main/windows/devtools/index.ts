import { join, resolve } from 'node:path'

import { BrowserWindow, shell } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'

export interface DevtoolsWindowManager {
  openWindow: (route?: string) => Promise<BrowserWindow>
  getWindow: () => Promise<BrowserWindow>
}

export function setupDevtoolsWindow(): DevtoolsWindowManager {
  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))
  const defaultRoute = '/devtools/markdown-stress'
  let currentRoute = defaultRoute

  const reusable = createReusableWindow(async () => {
    const window = new BrowserWindow({
      title: 'Devtools',
      width: 1020,
      height: 720,
      minWidth: 640,
      minHeight: 480,
      show: false,
      icon,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        // Preload exposes Electron APIs and needs Node access.
        sandbox: false,
      },
    })

    window.on('ready-to-show', () => window.show())
    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    await load(window, withHashRoute(rendererBase, currentRoute))
    return window
  })

  async function openWindow(route?: string) {
    if (route)
      currentRoute = route

    const window = await reusable.getWindow()
    const targetRoute = route ?? currentRoute
    const url = withHashRoute(rendererBase, targetRoute)

    // If the route changes while the window is open, reload to that route.
    const currentUrl = window.webContents.getURL()
    if (!currentUrl.includes(`#${targetRoute}`)) {
      await load(window, url)
    }

    return window
  }

  return {
    openWindow,
    getWindow: reusable.getWindow,
  }
}
