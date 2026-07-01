import type { ShortcutAccelerator, ShortcutBinding } from '@proj-airi/stage-shared/global-shortcut'

import type { globalAppConfigSchema } from '../../configs/global'
import type { Config } from '../../libs/electron/persistence'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { GlobalShortcutService } from '../../services/electron/global-shortcut'

import { join, resolve } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'
import { BrowserWindow, ipcMain, Notification, screen } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import {
  electronSpotlightHide,
  electronSpotlightShowResultNotification,
} from '../../../shared/eventa'
import { isSafeSpotlightAccelerator } from '../../../shared/spotlight-shortcut'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { setupBaseWindowElectronInvokes, transparentWindowConfig } from '../shared/window'

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
  chatWindow: () => Promise<BrowserWindow>
  globalShortcut: GlobalShortcutService
  appConfig: Config<typeof globalAppConfigSchema>
}): SpotlightWindowManager {
  const log = useLogg('spotlight-window').useGlobalConfig()
  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))

  // NOTICE:
  // Electron may GC a `Notification` once the constructor scope returns, which
  // silently drops its `click` handler before the user interacts. Hold a strong
  // reference until the notification is dismissed (`click` / `close`) or fails.
  const resultNotifications = new Set<Notification>()

  async function openChatWindowFromNotification() {
    try {
      const window = await params.chatWindow()
      if (window.isMinimized())
        window.restore()
      window.show()
      window.focus()
      window.moveTop()
    }
    catch (error) {
      log.withError(error).warn('Failed to open Chat window from Spotlight notification')
    }
  }

  function showNotification(body: string, onClick?: () => void) {
    const notification = new Notification({
      title: 'AIRI',
      body,
      ...(onClick && !isMacOS ? { timeoutType: 'never' as const } : {}),
    })
    resultNotifications.add(notification)
    const release = () => resultNotifications.delete(notification)

    notification.once('close', release)
    notification.once('failed', release)
    notification.once('click', () => {
      release()
      onClick?.()
    })
    notification.show()
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

      showNotification(payload.body, () => void openChatWindowFromNotification())
    })

    await load(window, withHashRoute(rendererBase, '/spotlight'))

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
