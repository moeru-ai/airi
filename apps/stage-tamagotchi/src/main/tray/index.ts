import type { LocaleDetector } from '@intlify/core'
import type { BrowserWindow } from 'electron'

import type { I18n } from '../libs/i18n'
import type { ServerChannel } from '../services/airi/channel-server'
import type { ScreenObserverService } from '../services/airi/screen-observer'
import type { setupBeatSync } from '../windows/beat-sync'
import type { setupCaptionWindowManager } from '../windows/caption'
import type { SettingsWindowManager } from '../windows/settings'
import type { WidgetsWindowManager } from '../windows/widgets'

import { env } from 'node:process'

import { is } from '@electron-toolkit/utils'
import { isRendererUnavailable } from '@proj-airi/electron-vueuse/main'
import { effect } from 'alien-signals'
import { app, Menu, nativeImage, screen, Tray } from 'electron'
import { debounce, once } from 'es-toolkit'
import { isMacOS } from 'std-env'

import icon from '../../../resources/icon.png?asset'
import macOSTrayIcon from '../../../resources/tray-icon-macos.png?asset'

import { onAppBeforeQuit } from '../libs/bootkit/lifecycle'
import { setupInlayWindow } from '../windows/inlay'
import { toggleWindowShow } from '../windows/shared/window'

const RECOMMENDED_WIDTH = 450
const RECOMMENDED_HEIGHT = 600
const ASPECT_RATIO = RECOMMENDED_WIDTH / RECOMMENDED_HEIGHT

function applyWindowSize(window: BrowserWindow, width: number, height: number, x?: number, y?: number): void {
  if (isRendererUnavailable(window)) {
    return
  }

  window.setResizable(true)

  const bounds = {
    width: Math.round(width),
    height: Math.round(height),
  } as Electron.Rectangle

  if (x !== undefined && y !== undefined) {
    bounds.x = Math.round(x)
    bounds.y = Math.round(y)
  }

  window.setBounds(bounds)
  if (x === undefined || y === undefined) {
    window.center()
  }

  window.show()
}

function alignWindow(window: BrowserWindow, position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'): void {
  const { width: windowWidth, height: windowHeight } = window.getBounds()
  const { x: areaX, y: areaY, width: areaWidth, height: areaHeight } = screen.getPrimaryDisplay().workArea

  switch (position) {
    case 'center':
      window.center()
      break
    case 'top-left':
      window.setPosition(areaX, areaY)
      break
    case 'top-right':
      window.setPosition(areaX + areaWidth - windowWidth, areaY)
      break
    case 'bottom-left':
      window.setPosition(areaX, areaY + areaHeight - windowHeight)
      break
    case 'bottom-right':
      window.setPosition(areaX + areaWidth - windowWidth, areaY + areaHeight - windowHeight)
      break
  }
  window.show()
}

function isSizeMatch(window: BrowserWindow, targetWidth: number, targetHeight: number): boolean {
  const { width, height } = window.getBounds()
  return Math.abs(width - Math.round(targetWidth)) <= 2 && Math.abs(height - Math.round(targetHeight)) <= 2
}

function isPositionMatch(window: BrowserWindow, targetX: number, targetY: number): boolean {
  const { x, y } = window.getBounds()
  return Math.abs(x - targetX) <= 5 && Math.abs(y - targetY) <= 5
}

// NOTICE:
// Text glyphs stand in for real tray badge icons until dedicated status
// image assets exist (observing = dot / paused = slash / unconfigured = none).
// Root cause: nativeImage badges need designed PNG/template assets which are
// a design deliverable, not code.
// Source: AIR-5 interaction spec — tray is the system-level source of truth.
// Removal condition: replace with status-specific tray icon assets and delete
// the glyph map.
const TRAY_STATUS_GLYPHS: Partial<Record<string, string>> = {
  observing: '●',
  paused: '⊘',
  suppressed_fullscreen: '⊘',
  suppressed_meeting: '⊘',
}

function formatLocalTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime()))
    return iso
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function setupTray(params: {
  mainWindow: BrowserWindow
  settingsWindow: SettingsWindowManager
  captionWindow: ReturnType<typeof setupCaptionWindowManager>
  widgetsWindow: WidgetsWindowManager
  beatSyncBgWindow: Awaited<ReturnType<typeof setupBeatSync>>
  aboutWindow: () => Promise<BrowserWindow>
  serverChannel: ServerChannel
  screenObserver: ScreenObserverService
  i18n: I18n
}): void {
  once(() => {
    const trayImage = nativeImage.createFromPath(isMacOS ? macOSTrayIcon : icon).resize({ width: 16 })
    trayImage.setTemplateImage(isMacOS)

    const appTray = new Tray(trayImage)
    onAppBeforeQuit(() => appTray.destroy())

    function observationStatusLabel(): string {
      const state = params.screenObserver.getState()
      const named = state.pauseUntil ? { time: formatLocalTime(state.pauseUntil) } : {}
      return params.i18n.t(`tamagotchi.electron.screen_observation.tray.status_${state.privacyState}`, named)
    }

    // The tray is the system-level source of truth for observation state:
    // even when the character window is hidden, one glance here must answer
    // "is it watching right now".
    function applyObservationPresence(): void {
      const state = params.screenObserver.getState()
      appTray.setToolTip(`Project AIRI — ${observationStatusLabel()}`)
      if (isMacOS)
        appTray.setTitle(TRAY_STATUS_GLYPHS[state.privacyState] ?? '')
    }

    function buildObservationMenuItems(): Electron.MenuItemConstructorOptions[] {
      const state = params.screenObserver.getState()
      const t = (key: string) => params.i18n.t(`tamagotchi.electron.screen_observation.tray.${key}`)

      const quickControls: Electron.MenuItemConstructorOptions[] = state.privacyState === 'paused'
        ? [{ label: t('resume'), click: () => void params.screenObserver.resume() }]
        : state.privacyState === 'observing' || state.privacyState === 'suppressed_fullscreen' || state.privacyState === 'suppressed_meeting'
          ? [{
              label: t('pause'),
              submenu: [
                { label: t('pause_15m'), click: () => void params.screenObserver.pause({ reason: 'manual_15m' }) },
                { label: t('pause_1h'), click: () => void params.screenObserver.pause({ reason: 'manual_1h' }) },
                { label: t('pause_today'), click: () => void params.screenObserver.pause({ reason: 'manual_today' }) },
              ],
            }]
          : []

      return [
        // First observation entry is always the literal current status.
        { label: observationStatusLabel(), enabled: false },
        ...quickControls,
        { label: t('observation_settings'), click: () => void params.settingsWindow.openWindow('/settings/modules/screen-observation') },
        { type: 'separator' },
      ]
    }

    const rebuildContextMenu = debounce((): void => {
      if (isRendererUnavailable(params.mainWindow)) {
        return
      }

      const { x: areaX, y: areaY, width: areaWidth, height: areaHeight } = screen.getPrimaryDisplay().workArea
      const { width: windowWidth, height: windowHeight } = params.mainWindow.getBounds()

      const fullHeightTarget = areaHeight
      const fullWidthTarget = Math.floor(areaHeight * ASPECT_RATIO)
      const halfHeightTarget = Math.floor(areaHeight / 2)
      const halfWidthTarget = Math.floor(halfHeightTarget * ASPECT_RATIO)

      const contextMenu = Menu.buildFromTemplate([
        { label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.show'), click: () => toggleWindowShow(params.mainWindow) },
        { type: 'separator' },
        ...buildObservationMenuItems(),
        {
          label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.adjust_sizes'),
          submenu: [
            {
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.recommended_size'),
              type: 'checkbox',
              checked: isSizeMatch(params.mainWindow, RECOMMENDED_WIDTH, RECOMMENDED_HEIGHT),
              click: () => applyWindowSize(params.mainWindow, RECOMMENDED_WIDTH, RECOMMENDED_HEIGHT),
            },
            {
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.full_height'),
              type: 'checkbox',
              checked: isSizeMatch(params.mainWindow, fullWidthTarget, fullHeightTarget),
              click: () => applyWindowSize(params.mainWindow, fullWidthTarget, fullHeightTarget),
            },
            {
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.half_height'),
              type: 'checkbox',
              checked: isSizeMatch(params.mainWindow, halfWidthTarget, halfHeightTarget),
              click: () => applyWindowSize(params.mainWindow, halfWidthTarget, halfHeightTarget),
            },
            {
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.full_screen'),
              type: 'checkbox',
              checked: isSizeMatch(params.mainWindow, areaWidth, areaHeight),
              click: () => applyWindowSize(params.mainWindow, areaWidth, areaHeight, areaX, areaY),
            },
          ],
        },
        {
          label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.align_to'),
          submenu: [
            {
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.center'),
              type: 'checkbox',
              checked: isPositionMatch(params.mainWindow, areaX + Math.floor((areaWidth - windowWidth) / 2), areaY + Math.floor((areaHeight - windowHeight) / 2)),
              click: () => alignWindow(params.mainWindow, 'center'),
            },
            { type: 'separator' },
            {
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.top_left'),
              type: 'checkbox',
              checked: isPositionMatch(params.mainWindow, areaX, areaY),
              click: () => alignWindow(params.mainWindow, 'top-left'),
            },
            {
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.top_right'),
              type: 'checkbox',
              checked: isPositionMatch(params.mainWindow, areaX + areaWidth - windowWidth, areaY),
              click: () => alignWindow(params.mainWindow, 'top-right'),
            },
            {
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.bottom_left'),
              type: 'checkbox',
              checked: isPositionMatch(params.mainWindow, areaX, areaY + areaHeight - windowHeight),
              click: () => alignWindow(params.mainWindow, 'bottom-left'),
            },
            {
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.bottom_right'),
              type: 'checkbox',
              checked: isPositionMatch(params.mainWindow, areaX + areaWidth - windowWidth, areaY + areaHeight - windowHeight),
              click: () => alignWindow(params.mainWindow, 'bottom-right'),
            },
          ],
        },
        { type: 'separator' },
        { label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.settings'), click: () => void params.settingsWindow.openWindow('/settings') },
        { label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.about'), click: () => params.aboutWindow().then(window => toggleWindowShow(window)) },
        { type: 'separator' },
        { label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.open_inlay'), click: () => setupInlayWindow({ i18n: params.i18n, serverChannel: params.serverChannel }) },
        { label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.open_widgets'), click: () => params.widgetsWindow.getWindow().then(window => toggleWindowShow(window)) },
        {
          label: params.i18n.t(params.captionWindow.isVisible()
            ? 'tamagotchi.electron.tray.menu.labels.label.close_caption'
            : 'tamagotchi.electron.tray.menu.labels.label.open_caption'),
          click: () => {
            void params.captionWindow.toggleVisibility().then(() => rebuildContextMenu())
          },
        },
        {
          type: 'submenu',
          label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.caption_overlay'),
          submenu: Menu.buildFromTemplate([
            { type: 'checkbox', label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.follow_window'), checked: params.captionWindow.getIsFollowingWindow(), click: async menuItem => await params.captionWindow.setFollowWindow(Boolean(menuItem.checked)) },
            { label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.reset_position'), click: async () => await params.captionWindow.resetToSide() },
          ]),
        },
        { type: 'separator' },
        ...is.dev || env.MAIN_APP_DEBUG || env.APP_DEBUG
          ? [
              { type: 'header', label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.devtools') },
              { label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.troubleshoot_beatsync'), click: () => params.beatSyncBgWindow.webContents.openDevTools({ mode: 'detach' }) },
              { type: 'separator' },
            ] as const
          : [],
        { label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.quit'), click: () => app.quit() },
      ])

      appTray.setContextMenu(contextMenu)
    }, 50)

    params.mainWindow.on('resize', rebuildContextMenu)
    params.mainWindow.on('move', rebuildContextMenu)
    params.captionWindow.onVisibilityChanged(rebuildContextMenu)
    params.screenObserver.onStateChanged(() => {
      applyObservationPresence()
      rebuildContextMenu()
    })

    applyObservationPresence()
    rebuildContextMenu()

    effect(() => {
      const locale = params.i18n.locale as (() => string | LocaleDetector<any[]> | undefined)
      locale()
      rebuildContextMenu()
    })

    appTray.addListener('click', () => toggleWindowShow(params.mainWindow))

    // On macOS, there's a special double-click event
    if (isMacOS) {
      appTray.addListener('double-click', () => toggleWindowShow(params.mainWindow))
    }
  })()
}
