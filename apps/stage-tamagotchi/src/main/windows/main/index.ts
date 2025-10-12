import type { BrowserWindowConstructorOptions, Rectangle } from 'electron'

import { dirname, join, resolve } from 'node:path'
import { env, platform } from 'node:process'
import { fileURLToPath } from 'node:url'

import clickDragPlugin from 'electron-click-drag-plugin'

import { is } from '@electron-toolkit/utils'
import { defu } from 'defu'
import { BrowserWindow, ipcMain, shell } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load } from '../../libs/electron/location'
import { transparentWindowConfig } from '../shared'
import { createConfig } from '../shared/persistence'
import { setupMainWindowElectronInvokes } from './rpc/index.electron'

interface AppConfig {
  windows?: Array<Pick<BrowserWindowConstructorOptions, 'title' | 'x' | 'y' | 'width' | 'height'> & { tag: string }>
}

export async function setupMainWindow(params: {
  settingsWindow: () => Promise<BrowserWindow>
}) {
  const {
    setup: setupConfig,
    get: getConfig,
    update: updateConfig,
  } = createConfig<AppConfig>('app', 'config.json', { default: { windows: [] } })

  setupConfig()

  const mainWindowConfig = getConfig()?.windows?.find(w => w.title === 'AIRI' && w.tag === 'main')

  const window = new BrowserWindow({
    title: 'AIRI',
    width: mainWindowConfig?.width ?? 450.0,
    height: mainWindowConfig?.height ?? 600.0,
    x: mainWindowConfig?.x,
    y: mainWindowConfig?.y,
    show: false,
    icon,
    webPreferences: {
      preload: join(dirname(fileURLToPath(import.meta.url)), '../preload/index.mjs'),
      sandbox: false,
    },
    ...transparentWindowConfig(),
  })

  // NOTICE: in development mode, open devtools by default
  if (is.dev || env.MAIN_APP_DEBUG || env.APP_DEBUG) {
    try {
      window.webContents.openDevTools({ mode: 'detach' })
    }
    catch (err) {
      console.error('failed to open devtools:', err)
    }
  }

  function handleNewBounds(newBounds: Rectangle) {
    const config = getConfig()!
    if (!config.windows || !Array.isArray(config.windows)) {
      config.windows = []
    }

    const existingConfigIndex = config.windows.findIndex(w => w.title === 'AIRI' && w.tag === 'main')

    if (existingConfigIndex === -1) {
      config.windows.push({
        title: 'AIRI',
        tag: 'main',
        x: newBounds.x,
        y: newBounds.y,
        width: newBounds.width,
        height: newBounds.height,
      })
    }
    else {
      const mainWindowConfig = defu(config.windows[existingConfigIndex], { title: 'AIRI', tag: 'main' })

      mainWindowConfig.x = newBounds.x
      mainWindowConfig.y = newBounds.y
      mainWindowConfig.width = newBounds.width
      mainWindowConfig.height = newBounds.height

      config.windows[existingConfigIndex] = mainWindowConfig
    }

    updateConfig(config)
  }

  window.on('resize', () => handleNewBounds(window.getBounds()))
  window.on('move', () => handleNewBounds(window.getBounds()))

  window.setAlwaysOnTop(true)
  if (isMacOS) {
    window.setWindowButtonVisibility(false)
  }

  window.on('ready-to-show', () => window!.show())
  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  await load(window, baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')))

  setupMainWindowElectronInvokes({ window, settingsWindow: params.settingsWindow })

  /**
   * This is a know issue (or expected behavior maybe) to Electron.
   *
   * Discussion: https://github.com/electron/electron/issues/37789
   * Workaround: https://github.com/noobfromph/electron-click-drag-plugin
   */
  ipcMain.on('start-drag', () => {
    try {
      const hwndBuffer = window.getNativeWindowHandle()
      // Linux: extract X11 Window ID from the buffer (first 4 bytes, little-endian)
      // macOS/Windows: pass Buffer directly
      const windowId = platform === 'linux' ? hwndBuffer.readUInt32LE(0) : hwndBuffer

      clickDragPlugin.startDrag(windowId)
    }
    catch (error) {
      console.error(error)
    }
  })

  return window
}
