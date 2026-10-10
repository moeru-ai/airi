import type { ShortcutAccelerator, ShortcutBinding } from '@proj-airi/stage-shared/global-shortcut'

import type { globalAppConfigSchema } from '../../configs/global'
import type { Config } from '../../libs/electron/persistence'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { DesktopNotificationCenter } from '../../services/electron/desktop-notifications'
import type { GlobalShortcutService } from '../../services/electron/global-shortcut'
import type { ChatWindowManager } from '../chat'

import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'
import { BrowserWindow, ipcMain, screen } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import {
  electronSpotlightHide,
  electronSpotlightShowResultNotification,
} from '../../../shared/eventa'
import { isSafeSpotlightAccelerator } from '../../../shared/spotlight-shortcut'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { excludeWindowFromTaskbar } from '../shared/app-icon'
import { protectPrivilegedWindowNavigation, setupBaseWindowElectronInvokes, transparentWindowConfig } from '../shared/window'

const SPOTLIGHT_WINDOW_WIDTH = 720
const SPOTLIGHT_WINDOW_HEIGHT = 100
const SPOTLIGHT_SHORTCUT_ID = 'spotlight'
const defaultSpotlightAccelerator: ShortcutAccelerator = { modifiers: ['ctrl', 'shift'], key: 'KeyA' }

export interface SpotlightWindowManager {
  show: () => Promise<void>
  getShortcutAccelerator: () => ShortcutAccelerator
  updateShortcutAccelerator: (accelerator: ShortcutAccelerator | null) => ReturnType<GlobalShortcutService['registerMainShortcut']>
}

function resolveSpotlightBounds() {
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { x, y, width } = display.workArea

  return {
    x: Math.round(x + (width - SPOTLIGHT_WINDOW_WIDTH) / 2),
    y: Math.round(y + display.workArea.height * 0.22),
    width: SPOTLIGHT_WINDOW_WIDTH,
    height: SPOTLIGHT_WINDOW_HEIGHT,
  }
}

export function setupSpotlightWindowManager(params: {
  serverChannel: ServerChannel
  i18n: I18n
  chatWindow: ChatWindowManager
  globalShortcut: GlobalShortcutService
  appConfig: Config<typeof globalAppConfigSchema>
  desktopCompanion: DesktopNotificationCenter
}): SpotlightWindowManager {
  const log = useLogg('spotlight-window').useGlobalConfig()
  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))

  async function openChatWindowFromNotification() {
    try {
      await params.chatWindow.open()
    }
    catch (error) {
      log.withError(error).warn('Failed to open Chat window from Spotlight notification')
    }
  }

  const reusable = createReusableWindow(async () => {
    const window = new BrowserWindow({
      ...transparentWindowConfig(),
      titleBarStyle: undefined,
      title: 'Spotlight',
      width: SPOTLIGHT_WINDOW_WIDTH,
      height: SPOTLIGHT_WINDOW_HEIGHT,
      show: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      icon,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
    })

    excludeWindowFromTaskbar(window)
    protectPrivilegedWindowNavigation(window)

    window.on('blur', () => window.hide())

    const { context } = createContext(ipcMain, window)
    await setupBaseWindowElectronInvokes({ context, window, i18n: params.i18n, serverChannel: params.serverChannel })

    // Only the Spotlight window may call these private invokes.
    const isFromSpotlightWindow = (senderId?: number) => window.webContents.id === senderId

    defineInvokeHandler(context, electronSpotlightHide, (_, options) => {
      if (isFromSpotlightWindow(options?.raw.ipcMainEvent.sender.id))
        window.hide()
    })

    defineInvokeHandler(context, electronSpotlightShowResultNotification, (payload, options) => {
      if (!payload || !isFromSpotlightWindow(options?.raw.ipcMainEvent.sender.id))
        return

      params.desktopCompanion.publish({
        id: randomUUID(),
        source: 'spotlight',
        body: payload.body.slice(0, 4000),
        priority: 'normal',
        coalesceKey: 'spotlight-result',
      }, () => void openChatWindowFromNotification())
    })

    await load(window, withHashRoute(rendererBase, '/spotlight', {
      query: {
        'stage-runtime': 'minimal',
        'synced-leader': 'false',
      },
    }))

    return window
  })

  async function show() {
    const window = await reusable.getWindow()
    window.setBounds(resolveSpotlightBounds())
    window.show()
    window.focus()
    window.webContents.focus()
  }

  function getShortcutAccelerator(): ShortcutAccelerator {
    return params.appConfig.get()?.spotlightShortcutAccelerator ?? defaultSpotlightAccelerator
  }

  function createShortcutBinding(accelerator = getShortcutAccelerator()): ShortcutBinding {
    return {
      id: SPOTLIGHT_SHORTCUT_ID,
      accelerator,
      scope: 'global',
      description: 'Spotlight',
    }
  }

  function handleShortcutTriggered() {
    void show().catch((error) => {
      log.withError(error).warn('Failed to show Spotlight window')
    })
  }

  function updateShortcutAccelerator(accelerator: ShortcutAccelerator | null) {
    const nextAccelerator = accelerator ?? defaultSpotlightAccelerator
    if (!isSafeSpotlightAccelerator(nextAccelerator))
      return { id: SPOTLIGHT_SHORTCUT_ID, ok: false as const, reason: ShortcutFailureReasons.Invalid }

    const registration = params.globalShortcut.registerMainShortcut({
      binding: createShortcutBinding(nextAccelerator),
      onTriggered: handleShortcutTriggered,
    })

    if (registration.ok) {
      params.appConfig.update({
        ...params.appConfig.get(),
        spotlightShortcutAccelerator: nextAccelerator,
      })
    }
    else {
      log.warn(`Failed to update Spotlight shortcut: ${registration.reason}`)
    }

    return registration.ok ? { ...registration, actualAccelerator: nextAccelerator } : registration
  }

  // Main-owned so renderer `unregisterAll` resets do not drop Spotlight.
  const shortcutResult = params.globalShortcut.registerMainShortcut({
    binding: createShortcutBinding(),
    onTriggered: handleShortcutTriggered,
  })

  if (!shortcutResult.ok) {
    log.warn(`Failed to register Spotlight shortcut: ${shortcutResult.reason}`)
    showNotification(params.i18n.t('tamagotchi.spotlight.errors.shortcutRegistrationFailed'))
  }

  return {
    getShortcutAccelerator,
    show,
    updateShortcutAccelerator,
  }
}
