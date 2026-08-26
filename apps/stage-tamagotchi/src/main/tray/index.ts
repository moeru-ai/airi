import type { LocaleDetector } from '@intlify/core'
import type { BrowserWindow, Rectangle } from 'electron'

import type { I18n } from '../libs/i18n'
import type { ServerChannel } from '../services/airi/channel-server'
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

import { findDominantDisplayArea } from '../../shared/utils/electron/display'
import { onAppBeforeQuit } from '../libs/bootkit/lifecycle'
import { setupInlayWindow } from '../windows/inlay'
import { Animator } from '../windows/shared/animator'
import { computeResizedBoundsAnchoredToDominantDisplay } from '../windows/shared/display'
import { toggleWindowShow } from '../windows/shared/window'

const RECOMMENDED_WIDTH = 450
const RECOMMENDED_HEIGHT = 600
const ASPECT_RATIO = RECOMMENDED_WIDTH / RECOMMENDED_HEIGHT

export function setupTray(params: {
  aboutWindow: () => Promise<BrowserWindow>
  beatSyncBgWindow: Awaited<ReturnType<typeof setupBeatSync>>
  captionWindow: ReturnType<typeof setupCaptionWindowManager>
  i18n: I18n
  mainWindow: BrowserWindow
  serverChannel: ServerChannel
  settingsWindow: SettingsWindowManager
  widgetsWindow: WidgetsWindowManager
}): void {
  once(() => {
    const mainWindowAnimator = new Animator(params.mainWindow)

    function animateMainWindowTo(workArea: Rectangle, position: Parameters<typeof resolveAlignedWindowBounds>[2]) {
      const bounds = resolveAlignedWindowBounds(params.mainWindow, workArea, position)
      mainWindowAnimator.windowBoundsAnimateTo(bounds)
      params.mainWindow.show()
    }

    function applyMainWindowSize(width: number, height: number, x?: number, y?: number) {
      mainWindowAnimator.stop()
      applyWindowSize(params.mainWindow, width, height, x, y)
    }

    const trayImage = nativeImage.createFromPath(isMacOS ? macOSTrayIcon : icon).resize({ width: 16 })
    trayImage.setTemplateImage(isMacOS)

    const appTray = new Tray(trayImage)

    const rebuildContextMenu = debounce((): void => {
      if (isRendererUnavailable(params.mainWindow)) {
        return
      }

      const mainWindowBounds = params.mainWindow.getBounds()
      const currentDisplay = findDominantDisplayArea(mainWindowBounds, screen.getAllDisplays()) ?? screen.getDisplayMatching(mainWindowBounds)
      const { height: areaHeight, width: areaWidth, x: areaX, y: areaY } = currentDisplay.workArea
      const { height: windowHeight, width: windowWidth } = mainWindowBounds

      const fullHeightTarget = areaHeight
      const fullWidthTarget = Math.floor(areaHeight * ASPECT_RATIO)
      const halfHeightTarget = Math.floor(areaHeight / 2)
      const halfWidthTarget = Math.floor(halfHeightTarget * ASPECT_RATIO)

      const contextMenu = Menu.buildFromTemplate([
        { click: () => toggleWindowShow(params.mainWindow), label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.show') },
        { type: 'separator' },
        {
          label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.adjust_sizes'),
          submenu: [
            {
              checked: isSizeMatch(params.mainWindow, RECOMMENDED_WIDTH, RECOMMENDED_HEIGHT),
              click: () => applyMainWindowSize(RECOMMENDED_WIDTH, RECOMMENDED_HEIGHT),
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.recommended_size'),
              type: 'checkbox',
            },
            {
              checked: isSizeMatch(params.mainWindow, fullWidthTarget, fullHeightTarget),
              click: () => applyMainWindowSize(fullWidthTarget, fullHeightTarget),
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.full_height'),
              type: 'checkbox',
            },
            {
              checked: isSizeMatch(params.mainWindow, halfWidthTarget, halfHeightTarget),
              click: () => applyMainWindowSize(halfWidthTarget, halfHeightTarget),
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.half_height'),
              type: 'checkbox',
            },
            {
              checked: isSizeMatch(params.mainWindow, areaWidth, areaHeight),
              click: () => applyMainWindowSize(areaWidth, areaHeight, areaX, areaY),
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.full_screen'),
              type: 'checkbox',
            },
          ],
        },
        {
          label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.align_to'),
          submenu: [
            {
              checked: isPositionMatch(params.mainWindow, areaX + Math.floor((areaWidth - windowWidth) / 2), areaY + Math.floor((areaHeight - windowHeight) / 2)),
              click: () => animateMainWindowTo(currentDisplay.workArea, 'center'),
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.center'),
              type: 'checkbox',
            },
            { type: 'separator' },
            {
              checked: isPositionMatch(params.mainWindow, areaX, areaY),
              click: () => animateMainWindowTo(currentDisplay.workArea, 'top-left'),
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.top_left'),
              type: 'checkbox',
            },
            {
              checked: isPositionMatch(params.mainWindow, areaX + areaWidth - windowWidth, areaY),
              click: () => animateMainWindowTo(currentDisplay.workArea, 'top-right'),
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.top_right'),
              type: 'checkbox',
            },
            {
              checked: isPositionMatch(params.mainWindow, areaX, areaY + areaHeight - windowHeight),
              click: () => animateMainWindowTo(currentDisplay.workArea, 'bottom-left'),
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.bottom_left'),
              type: 'checkbox',
            },
            {
              checked: isPositionMatch(params.mainWindow, areaX + areaWidth - windowWidth, areaY + areaHeight - windowHeight),
              click: () => animateMainWindowTo(currentDisplay.workArea, 'bottom-right'),
              label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.bottom_right'),
              type: 'checkbox',
            },
          ],
        },
        { type: 'separator' },
        { click: () => void params.settingsWindow.openWindow('/settings'), label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.settings') },
        { click: () => params.aboutWindow().then(window => toggleWindowShow(window)), label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.about') },
        { type: 'separator' },
        { click: () => setupInlayWindow({ i18n: params.i18n, serverChannel: params.serverChannel }), label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.open_inlay') },
        { click: () => params.widgetsWindow.getWindow().then(window => toggleWindowShow(window)), label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.open_widgets') },
        {
          click: () => {
            void params.captionWindow.toggleVisibility().then(() => rebuildContextMenu())
          },
          label: params.i18n.t(params.captionWindow.isVisible()
            ? 'tamagotchi.electron.tray.menu.labels.label.close_caption'
            : 'tamagotchi.electron.tray.menu.labels.label.open_caption'),
        },
        {
          label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.caption_overlay'),
          submenu: Menu.buildFromTemplate([
            { checked: params.captionWindow.getIsFollowingWindow(), click: async menuItem => await params.captionWindow.setFollowWindow(Boolean(menuItem.checked)), label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.follow_window'), type: 'checkbox' },
            { click: async () => await params.captionWindow.resetToSide(), label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.reset_position') },
          ]),
          type: 'submenu',
        },
        { type: 'separator' },
        ...is.dev || env.MAIN_APP_DEBUG || env.APP_DEBUG
          ? [
              { label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.devtools'), type: 'header' },
              { click: () => params.beatSyncBgWindow.webContents.openDevTools({ mode: 'detach' }), label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.troubleshoot_beatsync') },
              { type: 'separator' },
            ] as const
          : [],
        { click: () => app.quit(), label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.quit') },
      ])

      appTray.setContextMenu(contextMenu)
    }, 50)

    params.mainWindow.on('resize', rebuildContextMenu)
    params.mainWindow.on('move', rebuildContextMenu)
    const visibilityChangeUnListener = params.captionWindow.onVisibilityChanged(rebuildContextMenu)

    rebuildContextMenu()

    const stopLocaleEffect = effect(() => {
      const locale = params.i18n.locale as (() => LocaleDetector<any[]> | string | undefined)
      locale()
      rebuildContextMenu()
    })

    onAppBeforeQuit(() => {
      // Stop every menu rebuild source before canceling its pending trailing call.
      // The tray must remain alive until no callback can reach it.
      params.mainWindow.off('resize', rebuildContextMenu)
      params.mainWindow.off('move', rebuildContextMenu)

      visibilityChangeUnListener()
      stopLocaleEffect()

      rebuildContextMenu.cancel()
      mainWindowAnimator.stop()

      appTray.destroy()
    })

    appTray.setToolTip('Project AIRI')
    appTray.addListener('click', () => toggleWindowShow(params.mainWindow))

    // On macOS, there's a special double-click event
    if (isMacOS) {
      appTray.addListener('double-click', () => toggleWindowShow(params.mainWindow))
    }
  })()
}

function applyWindowSize(window: BrowserWindow, width: number, height: number, x?: number, y?: number): void {
  if (isRendererUnavailable(window)) {
    return
  }

  window.setResizable(true)

  const bounds = x !== undefined && y !== undefined
    ? {
        height: Math.round(height),
        width: Math.round(width),
        x: Math.round(x),
        y: Math.round(y),
      }
    : computeResizedBoundsAnchoredToDominantDisplay({
        currentBounds: window.getBounds(),
        displays: screen.getAllDisplays(),
        targetSize: { height, width },
      })

  window.setBounds(bounds)
  window.show()
}

function isPositionMatch(window: BrowserWindow, targetX: number, targetY: number): boolean {
  const { x, y } = window.getBounds()
  return Math.abs(x - targetX) <= 5 && Math.abs(y - targetY) <= 5
}

function isSizeMatch(window: BrowserWindow, targetWidth: number, targetHeight: number): boolean {
  const { height, width } = window.getBounds()
  return Math.abs(width - Math.round(targetWidth)) <= 2 && Math.abs(height - Math.round(targetHeight)) <= 2
}

function resolveAlignedWindowBounds(
  window: BrowserWindow,
  workArea: Rectangle,
  position: 'bottom-left' | 'bottom-right' | 'center' | 'top-left' | 'top-right',
): Rectangle {
  const { height: windowHeight, width: windowWidth } = window.getBounds()
  const { height: areaHeight, width: areaWidth, x: areaX, y: areaY } = workArea

  let x = areaX
  let y = areaY

  switch (position) {
    case 'bottom-left':
      y = areaY + areaHeight - windowHeight
      break
    case 'bottom-right':
      x = areaX + areaWidth - windowWidth
      y = areaY + areaHeight - windowHeight
      break
    case 'center':
      x = areaX + Math.floor((areaWidth - windowWidth) / 2)
      y = areaY + Math.floor((areaHeight - windowHeight) / 2)
      break
    case 'top-left':
      break
    case 'top-right':
      x = areaX + areaWidth - windowWidth
      break
  }

  return { height: windowHeight, width: windowWidth, x, y }
}
