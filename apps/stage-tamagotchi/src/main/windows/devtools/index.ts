import { join, resolve } from 'node:path'

import { BrowserWindow } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { protectPrivilegedWindowNavigation } from '../shared'

export interface DevtoolsWindowManager {
  openWindow: (params: OpenDevtoolsWindowParams) => Promise<BrowserWindow>
}

export interface OpenDevtoolsWindowParams extends Partial<Electron.Rectangle> {
  key: string
  route?: string
}

export function setupDevtoolsWindow(): DevtoolsWindowManager {
  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))
  const defaultRoute = '/devtools'
  const reusableWindows = new Map<string, ReturnType<typeof createReusableWindow>>()

  function getReusableForKey(key: string, route: string) {
    const existing = reusableWindows.get(key)
    if (existing)
      return existing

    const reusable = createReusableWindow(async () => {
      const window = new BrowserWindow({
        height: 720,
        icon,
        minHeight: 480,
        minWidth: 640,
        show: false,
        title: 'Devtools',
        webPreferences: {
          preload: join(getElectronMainDirname(), '../preload/index.mjs'),
          // Preload exposes Electron APIs and needs Node access.
          sandbox: false,
        },
        width: 1020,
      })

      window.on('ready-to-show', () => window.show())
      window.on('closed', () => {
        if (reusableWindows.get(key) === reusable)
          reusableWindows.delete(key)
      })
      protectPrivilegedWindowNavigation(window)

      await load(window, withHashRoute(rendererBase, route, {
        query: { 'synced-leader': 'false' },
      }))
      return window
    })

    reusableWindows.set(key, reusable)
    return reusable
  }

  async function openWindow(params: OpenDevtoolsWindowParams) {
    const targetRoute = params.route ?? defaultRoute
    const window = await getReusableForKey(params.key, targetRoute).getWindow()

    if (params && (params.width !== undefined || params.height !== undefined || params.x !== undefined || params.y !== undefined)) {
      const bounds: Partial<Electron.Rectangle> = {}
      if (params.width !== undefined)
        bounds.width = params.width
      if (params.height !== undefined)
        bounds.height = params.height
      if (params.x !== undefined)
        bounds.x = params.x
      if (params.y !== undefined)
        bounds.y = params.y
      window.setBounds(bounds)
    }

    return window
  }

  return {
    openWindow,
  }
}
