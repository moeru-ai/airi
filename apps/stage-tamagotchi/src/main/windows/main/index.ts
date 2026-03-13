import type { Rectangle } from 'electron'
import type { InferOutput } from 'valibot'

import type { globalAppConfigSchema } from '../../configs/global'
import type { Config } from '../../libs/electron/persistence'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { McpStdioManager } from '../../services/airi/mcp-servers'
import type { AutoUpdater } from '../../services/electron/auto-updater'
import type { NoticeWindowManager } from '../notice'
import type { OnboardingWindowManager } from '../onboarding'
import type { SettingsWindowManager } from '../settings'
import type { WidgetsWindowManager } from '../widgets'

import { dirname, resolve } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import clickDragPlugin from 'electron-click-drag-plugin'

import { is } from '@electron-toolkit/utils'
import { defu } from 'defu'
import { BrowserWindow, ipcMain, shell } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, load } from '../../libs/electron/location'
import { transparentWindowConfig } from '../shared'
import { setupMainWindowElectronInvokes } from './rpc/index.electron'

export async function setupMainWindow(params: {
  settingsWindow: SettingsWindowManager
  chatWindow: () => Promise<BrowserWindow>
  widgetsManager: WidgetsWindowManager
  noticeWindow: NoticeWindowManager
  autoUpdater: AutoUpdater
  onWindowCreated?: (window: BrowserWindow) => void
  serverChannel: ServerChannel
  mcpStdioManager: McpStdioManager
  i18n: I18n
  onboardingWindowManager: OnboardingWindowManager
  appConfig: Config<typeof globalAppConfigSchema>
}) {
  const getConfig = (): InferOutput<typeof globalAppConfigSchema> => params.appConfig.get() ?? { language: 'en', windows: [] }
  const updateConfig = (newData: InferOutput<typeof globalAppConfigSchema>) => params.appConfig.update(newData)

  const mainWindowConfig = getConfig().windows?.find((w: any) => w.title === 'AIRI' && w.tag === 'main')

  const window = new BrowserWindow({
    title: 'AIRI',
    width: mainWindowConfig?.snapshot?.width ?? mainWindowConfig?.width ?? 450.0,
    height: mainWindowConfig?.snapshot?.height ?? mainWindowConfig?.height ?? 600.0,
    x: mainWindowConfig?.snapshot?.x ?? mainWindowConfig?.x,
    y: mainWindowConfig?.snapshot?.y ?? mainWindowConfig?.y,
    show: false,
    icon,
    webPreferences: {
      preload: resolve(dirname(fileURLToPath(import.meta.url)), '../preload/index.mjs'),
      sandbox: false,
    },
    type: 'panel',
    alwaysOnTop: true,
    ...transparentWindowConfig(),
  })

  // Attach config for RPC sync
  ;(window as any).__airi_config = mainWindowConfig

  window.setMovable(!mainWindowConfig?.locked)
  window.setResizable(!mainWindowConfig?.locked)

  if (params.onWindowCreated) {
    params.onWindowCreated(window)
  }

  ipcMain.on('main-window-config-updated', (_event, config) => {
    window.webContents.send('eventa:event:electron:windows:main:config-changed', config)
  })

  if (is.dev || env.MAIN_APP_DEBUG || env.APP_DEBUG) {
    try {
      window.webContents.openDevTools({ mode: 'detach' })
    }
    catch {}
  }

  function restoreBounds() {
    const mainWindow = getConfig().windows?.find((w: any) => w.title === 'AIRI' && w.tag === 'main')
    if (mainWindow?.snapshot) {
      window.setBounds(mainWindow.snapshot)
    }
  }

  window.on('ready-to-show', () => {
    restoreBounds()
    window.show()
    // NOTICE: on some platforms/transparency settings, first bounds application might be ignored
    setTimeout(() => restoreBounds(), 500)
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (typeof clickDragPlugin === 'function') {
    (clickDragPlugin as any)(window)
  }

  load(window, baseUrl(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'renderer')))

  await setupMainWindowElectronInvokes({
    window,
    settingsWindow: params.settingsWindow,
    chatWindow: params.chatWindow,
    widgetsManager: params.widgetsManager,
    noticeWindow: params.noticeWindow,
    autoUpdater: params.autoUpdater,
    serverChannel: params.serverChannel,
    mcpStdioManager: params.mcpStdioManager,
    i18n: params.i18n,
    onboardingWindowManager: params.onboardingWindowManager,
  })

  function handleNewBounds(newBounds: Rectangle) {
    const config = getConfig()
    if (!config.windows || !Array.isArray(config.windows)) {
      config.windows = []
    }

    const existingConfigIndex = config.windows.findIndex((w: any) => w.title === 'AIRI' && w.tag === 'main')
    const existingConfig = existingConfigIndex !== -1 ? config.windows[existingConfigIndex] : null

    if (existingConfig?.locked) {
      return
    }

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
      const currentConfig = config.windows[existingConfigIndex]
      config.windows[existingConfigIndex] = defu({
        x: newBounds.x,
        y: newBounds.y,
        width: newBounds.width,
        height: newBounds.height,
      }, currentConfig)
    }

    updateConfig(config)
    window.webContents.send('eventa:event:electron:windows:main:config-changed', config.windows.find((w: any) => w.title === 'AIRI' && w.tag === 'main'))
  }

  window.on('resize', () => handleNewBounds(window.getBounds()))
  window.on('move', () => handleNewBounds(window.getBounds()))

  return window
}
