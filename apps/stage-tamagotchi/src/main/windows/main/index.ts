import type { BrowserWindowConstructorOptions, Rectangle } from 'electron'

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defu } from 'defu'
import { BrowserWindow, shell } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, load } from '../../libs/electron/location'
import { transparentWindowConfig } from '../shared'
import { createConfig } from '../shared/persistence'
import { setupAppInvokeHandlers } from './rpc/index.electron'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface AppConfig {
  windows?: Array<Pick<BrowserWindowConstructorOptions, 'title' | 'x' | 'y' | 'width' | 'height'> & { tag: string }>
}

export async function setupMainWindow() {
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

  await load(window, baseUrl(resolve(__dirname, '..', '..', 'renderer')))

  setupAppInvokeHandlers(window)

  return window
}
