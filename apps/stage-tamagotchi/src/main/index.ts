import { join } from 'node:path'
import { env, platform } from 'node:process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { nativeImage, shell } from 'electron/common'
import { app, BrowserWindow, dialog, ipcMain, Tray } from 'electron/main'

import trayIconMacos from '../../build/icon-tray-macos.png?asset'
import icon from '../../build/icon.png?asset'
import { createI18n } from './locales'
import { createApplicationMenu, createTrayMenu } from './menu'

let mainWindow: BrowserWindow
let tray: Tray

const i18n = createI18n()

function showQuitDialog() {
  dialog.showMessageBox({
    type: 'info',
    title: i18n.t('menu.quit'),
    message: i18n.t('quitDialog.message'),
    buttons: [i18n.t('quitDialog.buttons.quit'), i18n.t('quitDialog.buttons.cancel')],
  }).then((result) => {
    if (result.response === 0) {
      mainWindow.webContents.send('before-quit')
      setTimeout(() => {
        app.quit()
      }, 2000)
    }
  })
}

function rebuildTrayMenu() {
  if (mainWindow.isVisible()) {
    tray.setContextMenu(createTrayMenu(i18n, mainWindow.isVisible(), () => {
      mainWindow.webContents.send('before-hide')
      setTimeout(() => {
        mainWindow.hide()
        rebuildTrayMenu()
      }, 2000)
    }, createSettingsWindow, showQuitDialog))
    return
  }
  tray.setContextMenu(createTrayMenu(i18n, mainWindow.isVisible(), () => {
    mainWindow.show()
    mainWindow.webContents.send('after-show')
    rebuildTrayMenu()
  }, createSettingsWindow, showQuitDialog))
}

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 300 * 1.5,
    height: 400 * 1.5,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    ...(platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(import.meta.dirname, '..', 'preload', 'index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.show()

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.

  if (is.dev && env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(env.ELECTRON_RENDERER_URL)
  }
  else {
    mainWindow.loadFile(join(import.meta.dirname, '..', '..', 'out', 'renderer', 'index.html'))
  }
}

let settingsWindow: BrowserWindow | null = null

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 300 * 2,
    height: 400 * 2,
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '..', 'preload', 'index.js'),
      sandbox: false,
    },
  })

  settingsWindow.on('ready-to-show', () => {
    settingsWindow?.show()
  })

  settingsWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  settingsWindow.on('close', () => {
    settingsWindow = null
  })

  settingsWindow.show()

  if (is.dev && env.ELECTRON_RENDERER_URL) {
    settingsWindow.loadURL(join(env.ELECTRON_RENDERER_URL, '#/settings'))
  }
  else {
    settingsWindow.loadFile(join(import.meta.dirname, '..', '..', 'out', 'renderer', 'index.html'), {
      hash: '/settings',
    })
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createApplicationMenu(i18n, showQuitDialog, createSettingsWindow)

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.github.moeru-ai.airi-tamagotchi')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('quit', showQuitDialog)

  ipcMain.on('open-settings', () => createSettingsWindow())

  createWindow()

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  const trayIcon = platform === 'darwin'
    ? nativeImage.createFromPath(trayIconMacos).resize({ width: 16, height: 16 })
    : nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  tray.setToolTip('Airi')
  rebuildTrayMenu()

  app.dock.hide()

  ipcMain.on('locale-changed', (_, language: string) => {
    i18n.setLocale(language)
    rebuildTrayMenu()
    createApplicationMenu(i18n, showQuitDialog, createSettingsWindow)
  })

  ipcMain.on('start-resize-window', () => {
    mainWindow.setResizable(true)
  })

  ipcMain.on('stop-resize-window', () => {
    mainWindow.setResizable(false)
  })

  ipcMain.handle('stop-move-window', () => {
    return mainWindow.getPosition()
  })

  ipcMain.on('window-size-changed', (_, width: number, height: number) => {
    if (width === 0 || height === 0) {
      mainWindow.setSize(300 * 1.5, 400 * 1.5) // back to default size
      return
    }
    mainWindow.setSize(width, height)
  })

  ipcMain.on('window-position-changed', (_, x: number, y: number) => {
    mainWindow.setPosition(x, y)
  })
})
