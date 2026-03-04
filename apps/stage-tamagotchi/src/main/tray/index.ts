import type { BrowserWindow } from 'electron'

import type { setupBeatSync } from '../windows/beat-sync'
import type { setupCaptionWindowManager } from '../windows/caption'
import type { WidgetsWindowManager } from '../windows/widgets'

import { env } from 'node:process'

import { is } from '@electron-toolkit/utils'
import { app, Menu, nativeImage, screen, Tray } from 'electron'
import { once } from 'es-toolkit'
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
  window.setFullScreen(false)
  window.setResizable(true)
  window.setSize(width, height)
  if (x !== undefined && y !== undefined) {
    window.setPosition(x, y)
  }
  else {
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
  return Math.abs(width - targetWidth) <= 2 && Math.abs(height - targetHeight) <= 2
}

function isPositionMatch(window: BrowserWindow, targetX: number, targetY: number): boolean {
  const { x, y } = window.getBounds()
  return Math.abs(x - targetX) <= 5 && Math.abs(y - targetY) <= 5
}

export function setupTray(params: {
  mainWindow: BrowserWindow
  settingsWindow: () => Promise<BrowserWindow>
  captionWindow: ReturnType<typeof setupCaptionWindowManager>
  widgetsWindow: WidgetsWindowManager
  beatSyncBgWindow: Awaited<ReturnType<typeof setupBeatSync>>
  aboutWindow: () => Promise<BrowserWindow>
}): void {
  once(() => {
    const trayImage = nativeImage.createFromPath(isMacOS ? macOSTrayIcon : icon).resize({ width: 16 })
    trayImage.setTemplateImage(isMacOS)

    const appTray = new Tray(trayImage)
    onAppBeforeQuit(() => appTray.destroy())

    const rebuildContextMenu = (): void => {
      const isFull = params.mainWindow.isFullScreen()
      const { height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
      const { x: areaX, y: areaY, width: areaWidth, height: areaHeight } = screen.getPrimaryDisplay().workArea
      const { width: windowWidth, height: windowHeight } = params.mainWindow.getBounds()

      const fullHeightTarget = screenHeight
      const fullWidthTarget = Math.floor(screenHeight * ASPECT_RATIO)
      const halfHeightTarget = Math.floor(screenHeight / 2)
      const halfWidthTarget = Math.floor(halfHeightTarget * ASPECT_RATIO)

      const contextMenu = Menu.buildFromTemplate([
        { label: 'Show', click: () => toggleWindowShow(params.mainWindow) },
        { type: 'separator' },
        {
          label: 'Adjust Sizes',
          submenu: [
            {
              label: 'Recommended (450x600)',
              type: 'checkbox',
              checked: !isFull && isSizeMatch(params.mainWindow, RECOMMENDED_WIDTH, RECOMMENDED_HEIGHT),
              click: () => applyWindowSize(params.mainWindow, RECOMMENDED_WIDTH, RECOMMENDED_HEIGHT),
            },
            {
              label: 'Full Height',
              type: 'checkbox',
              checked: !isFull && isSizeMatch(params.mainWindow, fullWidthTarget, fullHeightTarget),
              click: () => applyWindowSize(params.mainWindow, fullWidthTarget, fullHeightTarget),
            },
            {
              label: 'Half Height',
              type: 'checkbox',
              checked: !isFull && isSizeMatch(params.mainWindow, halfWidthTarget, halfHeightTarget),
              click: () => applyWindowSize(params.mainWindow, halfWidthTarget, halfHeightTarget),
            },
            {
              label: 'Full Screen',
              type: 'checkbox',
              checked: isFull,
              click: () => params.mainWindow.setFullScreen(true),
            },
            { type: 'separator' },
            {
              label: 'Toggle Full Screen',
              type: 'checkbox',
              checked: isFull,
              click: () => {
                const isFull = params.mainWindow.isFullScreen()
                params.mainWindow.setFullScreen(!isFull)
                if (isFull)
                  params.mainWindow.show()
              },
            },
          ],
        },
        {
          label: 'Align to',
          submenu: [
            {
              label: 'Center',
              type: 'checkbox',
              checked: !isFull && isPositionMatch(params.mainWindow, areaX + Math.floor((areaWidth - windowWidth) / 2), areaY + Math.floor((areaHeight - windowHeight) / 2)),
              click: () => alignWindow(params.mainWindow, 'center'),
            },
            { type: 'separator' },
            {
              label: 'Top Left',
              type: 'checkbox',
              checked: !isFull && isPositionMatch(params.mainWindow, areaX, areaY),
              click: () => alignWindow(params.mainWindow, 'top-left'),
            },
            {
              label: 'Top Right',
              type: 'checkbox',
              checked: !isFull && isPositionMatch(params.mainWindow, areaX + areaWidth - windowWidth, areaY),
              click: () => alignWindow(params.mainWindow, 'top-right'),
            },
            {
              label: 'Bottom Left',
              type: 'checkbox',
              checked: !isFull && isPositionMatch(params.mainWindow, areaX, areaY + areaHeight - windowHeight),
              click: () => alignWindow(params.mainWindow, 'bottom-left'),
            },
            {
              label: 'Bottom Right',
              type: 'checkbox',
              checked: !isFull && isPositionMatch(params.mainWindow, areaX + areaWidth - windowWidth, areaY + areaHeight - windowHeight),
              click: () => alignWindow(params.mainWindow, 'bottom-right'),
            },
          ],
        },
        { type: 'separator' },
        { label: 'Settings...', click: () => params.settingsWindow().then(window => toggleWindowShow(window)) },
        { label: 'About...', click: () => params.aboutWindow().then(window => toggleWindowShow(window)) },
        { type: 'separator' },
        { label: 'Open Inlay...', click: () => setupInlayWindow() },
        { label: 'Open Widgets...', click: () => params.widgetsWindow.getWindow().then(window => toggleWindowShow(window)) },
        { label: 'Open Caption...', click: () => params.captionWindow.getWindow().then(window => toggleWindowShow(window)) },
        {
          type: 'submenu',
          label: 'Caption Overlay',
          submenu: Menu.buildFromTemplate([
            { type: 'checkbox', label: 'Follow window', checked: params.captionWindow.getIsFollowingWindow(), click: async menuItem => await params.captionWindow.setFollowWindow(Boolean(menuItem.checked)) },
            { label: 'Reset position', click: async () => await params.captionWindow.resetToSide() },
          ]),
        },
        { type: 'separator' },
        ...is.dev || env.MAIN_APP_DEBUG || env.APP_DEBUG
          ? [
              { type: 'header', label: 'DevTools' },
              { label: 'Troubleshoot BeatSync...', click: () => params.beatSyncBgWindow.webContents.openDevTools() },
              { type: 'separator' },
            ] as const
          : [],
        { label: 'Quit', click: () => app.quit() },
      ])

      appTray.setContextMenu(contextMenu)
    }

    params.mainWindow.on('resize', rebuildContextMenu)
    params.mainWindow.on('move', rebuildContextMenu)
    params.mainWindow.on('enter-full-screen', rebuildContextMenu)
    params.mainWindow.on('leave-full-screen', rebuildContextMenu)

    rebuildContextMenu()

    appTray.setToolTip('Project AIRI')
    appTray.addListener('click', () => toggleWindowShow(params.mainWindow))

    // On macOS, there's a special double-click event
    if (isMacOS) {
      appTray.addListener('double-click', () => toggleWindowShow(params.mainWindow))
    }
  })()
}
