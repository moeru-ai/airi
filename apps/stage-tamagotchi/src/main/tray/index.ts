import type { BrowserWindow } from 'electron'

import type { setupBeatSync } from '../windows/beat-sync'
import type { setupCaptionWindowManager } from '../windows/caption'
import type { WidgetsWindowManager } from '../windows/widgets'

import { env } from 'node:process'

import { is } from '@electron-toolkit/utils'
import { app, Menu, nativeImage, Tray } from 'electron'
import { once } from 'es-toolkit'
import { isMacOS } from 'std-env'

import icon from '../../../resources/icon.png?asset'
import macOSTrayIcon from '../../../resources/tray-icon-macos.png?asset'

import { onAppBeforeQuit } from '../libs/bootkit/lifecycle'
import { setupInlayWindow } from '../windows/inlay'
import { toggleWindowShow } from '../windows/shared/window'

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

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show', click: () => toggleWindowShow(params.mainWindow) },
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
          ] as const // :(
        : [],
      { label: 'Quit', click: () => app.quit() },
    ])

    appTray.setContextMenu(contextMenu)
    appTray.setToolTip('Project AIRI')
    appTray.addListener('click', () => toggleWindowShow(params.mainWindow))

    // On macOS, there's a special double-click event
    if (isMacOS) {
      appTray.addListener('double-click', () => toggleWindowShow(params.mainWindow))
    }
  })()
}
