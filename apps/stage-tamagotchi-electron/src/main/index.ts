import { dirname, join } from 'node:path'
import { env, platform } from 'node:process'
import { fileURLToPath } from 'node:url'

import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel } from '@guiiai/logg'
import { defineInvokeHandler } from '@unbird/eventa'
import { createContext } from '@unbird/eventa/adapters/electron/main'
import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../resources/icon.png?asset'

import { electronCursorPoint, electronStartTrackingCursorPoint } from '../shared/eventa'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

if (/^true$/i.test(env.APP_REMOTE_DEBUG || '')) {
  const remoteDebugPort = Number(env.APP_REMOTE_DEBUG_PORT || '9222')
  if (Number.isNaN(remoteDebugPort) || !Number.isInteger(remoteDebugPort) || remoteDebugPort < 0 || remoteDebugPort > 65535) {
    throw new Error(`Invalid remote debug port: ${env.APP_REMOTE_DEBUG_PORT}`)
  }

  app.commandLine.appendSwitch('remote-debugging-port', String(remoteDebugPort))
  app.commandLine.appendSwitch('remote-allow-origins', `http://localhost:${remoteDebugPort}`)
}

app.dock?.setIcon(icon)

let trackCursorPointInterval: NodeJS.Timeout | undefined

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    title: 'AIRI',
    width: 450.0,
    height: 600.0,
    show: false,
    icon,
    webPreferences: {
      preload: join(dirname(fileURLToPath(import.meta.url)), '../preload/index.mjs'),
      sandbox: false,
    },
    frame: false,
    titleBarStyle: isMacOS ? 'hidden' : undefined,
    transparent: true,
    hasShadow: false,
  })

  const { context } = createContext(ipcMain, mainWindow)

  defineInvokeHandler(context, electronStartTrackingCursorPoint, () => {
    trackCursorPointInterval = setInterval(() => {
      const dipPos = screen.getCursorScreenPoint()
      // const pos = screen.dipToScreenPoint(dipPos)
      context.emit(electronCursorPoint, dipPos)
    // mainWindow.webContents.send(electronCursorPoint.id, dipPos)
    }, 32)
  })

  mainWindow.setAlwaysOnTop(true)
  mainWindow.setWindowButtonVisibility(false)
  mainWindow.on('ready-to-show', () => mainWindow!.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(env.ELECTRON_RENDERER_URL)
  }
  else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('ai.moeru.airi')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  createWindow()
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (trackCursorPointInterval) {
    clearInterval(trackCursorPointInterval)
  }

  if (platform !== 'darwin') {
    app.quit()
  }
})
