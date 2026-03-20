import type { LocaleDetector } from '@intlify/core'
import type { BrowserWindow } from 'electron'

import type { I18n } from '../libs/i18n'
import type { ServerChannel } from '../services/airi/channel-server'
import type { setupBeatSync } from '../windows/beat-sync'
import type { setupCaptionWindowManager } from '../windows/caption'
import type { SettingsWindowManager } from '../windows/settings'
import type { WidgetsWindowManager } from '../windows/widgets'

import { env } from 'node:process'

import { is } from '@electron-toolkit/utils'
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
  window.setResizable(true)
  const bounds = {
    width: Math.round(width),
    height: Math.round(height),
  } as any
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

export function setupTray(params: {
  mainWindow: BrowserWindow
  settingsWindow: SettingsWindowManager
  captionWindow: ReturnType<typeof setupCaptionWindowManager>
  widgetsWindow: WidgetsWindowManager
  beatSyncBgWindow: Awaited<ReturnType<typeof setupBeatSync>>
  aboutWindow: () => Promise<BrowserWindow>
  serverChannel: ServerChannel
  i18n: I18n
  getConfig: () => any
  updateConfig: (config: any) => void
}): void {
  once(() => {
    const trayImage = nativeImage.createFromPath(isMacOS ? macOSTrayIcon : icon).resize({ width: 16 })
    trayImage.setTemplateImage(isMacOS)

    const appTray = new Tray(trayImage)
    onAppBeforeQuit(() => appTray.destroy())

    const rebuildContextMenu = debounce((): void => {
      const { x: areaX, y: areaY, width: areaWidth, height: areaHeight } = screen.getPrimaryDisplay().workArea
      const { width: windowWidth, height: windowHeight } = params.mainWindow.getBounds()

      const fullHeightTarget = areaHeight
      const fullWidthTarget = Math.floor(areaHeight * ASPECT_RATIO)
      const halfHeightTarget = Math.floor(areaHeight / 2)
      const halfWidthTarget = Math.floor(halfHeightTarget * ASPECT_RATIO)

      const t = params.i18n.t
      const config = params.getConfig()
      const mainWindowConfig = config.windows?.find((w: any) => w.title === 'AIRI' && w.tag === 'main')

      const contextMenu = Menu.buildFromTemplate([
        { label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.show'), click: () => toggleWindowShow(params.mainWindow) },
        { type: 'separator' },
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
        {
          label: t('tamagotchi.electron.tray.menu.labels.label.position'),
          submenu: [
            {
              label: t('tamagotchi.electron.tray.menu.labels.label.lock'),
              type: 'checkbox',
              checked: !!mainWindowConfig?.locked,
              click: (item) => {
                const config = params.getConfig()
                if (!config.windows)
                  config.windows = []
                let index = config.windows.findIndex((w: any) => w.title === 'AIRI' && w.tag === 'main')
                if (index === -1) {
                  index = config.windows.push({ title: 'AIRI', tag: 'main' }) - 1
                }
                config.windows[index].locked = item.checked
                params.updateConfig(config)
                params.mainWindow.setMovable(!item.checked)
                params.mainWindow.setResizable(!item.checked)
                params.mainWindow.webContents.send('eventa:event:electron:windows:main:config-changed', config.windows[index])
                rebuildContextMenu()
              },
            },
            {
              // Snapshot the current window position as 'Home'
              // Allows users to snap back to their favorite position after moving the window consciously (e.g. for a temporary task) without manual repositioning.
              label: t('tamagotchi.electron.tray.menu.labels.label.snapshot'),
              click: () => {
                // Save the current window bounds as the "Home" position for future restoration.
                const config = params.getConfig()
                if (!config.windows)
                  config.windows = []
                let index = config.windows.findIndex((w: any) => w.title === 'AIRI' && w.tag === 'main')
                if (index === -1) {
                  index = config.windows.push({ title: 'AIRI', tag: 'main' }) - 1
                }
                const bounds = params.mainWindow.getBounds()
                config.windows[index].snapshot = {
                  x: bounds.x,
                  y: bounds.y,
                  width: bounds.width,
                  height: bounds.height,
                }
                params.updateConfig(config)
                params.mainWindow.webContents.send('eventa:event:electron:windows:main:config-changed', config.windows[index])
                rebuildContextMenu()
              },
            },
            {
              // Restore the window to the previously saved 'Home' position.
              label: t('tamagotchi.electron.tray.menu.labels.label.restore'),
              enabled: !!mainWindowConfig?.snapshot,
              click: () => {
                // Return the window to its previously saved "Home" position.
                const config = params.getConfig()
                const mainWindow = config.windows?.find((w: any) => w.title === 'AIRI' && w.tag === 'main')
                if (mainWindow?.snapshot) {
                  params.mainWindow.setBounds(mainWindow.snapshot)
                }
              },
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
              { label: params.i18n.t('tamagotchi.electron.tray.menu.labels.label.troubleshoot_beatsync'), click: () => params.beatSyncBgWindow.webContents.openDevTools() },
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

    rebuildContextMenu()

    effect(() => {
      const locale = params.i18n.locale as (() => string | LocaleDetector<any[]> | undefined)
      locale()
      rebuildContextMenu()
    })

    appTray.setToolTip('Project AIRI')
    appTray.addListener('click', () => toggleWindowShow(params.mainWindow))

    // On macOS, there's a special double-click event
    if (isMacOS) {
      appTray.addListener('double-click', () => toggleWindowShow(params.mainWindow))
    }
  })()
}
