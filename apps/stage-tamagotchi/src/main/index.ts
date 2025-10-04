import http from 'node:http'

import { dirname, join } from 'node:path'
import { env, platform } from 'node:process'
import { fileURLToPath } from 'node:url'

import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel } from '@guiiai/logg'
import { defineInvoke, defineInvokeHandler } from '@unbird/eventa'
import { createContext } from '@unbird/eventa/adapters/electron/main'
import { app, BrowserWindow, ipcMain, Menu, screen, shell, Tray } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../resources/icon.png?asset'

import { electronCursorPoint, electronOpenSettings, electronStartTrackingCursorPoint } from '../shared/eventa'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

// Store the eventa context and invokers to reuse them
let eventaContext: ReturnType<typeof createContext> | null = null
let openSettingsInvoker: ReturnType<typeof defineInvoke> | null = null

if (/^true$/i.test(env.APP_REMOTE_DEBUG || '')) {
  const remoteDebugPort = Number(env.APP_REMOTE_DEBUG_PORT || '9222')
  if (Number.isNaN(remoteDebugPort) || !Number.isInteger(remoteDebugPort) || remoteDebugPort < 0 || remoteDebugPort > 65535) {
    throw new Error(`Invalid remote debug port: ${env.APP_REMOTE_DEBUG_PORT}`)
  }

  app.commandLine.appendSwitch('remote-debugging-port', String(remoteDebugPort))
  app.commandLine.appendSwitch('remote-allow-origins', `http://localhost:${remoteDebugPort}`)
}

app.dock?.setIcon(icon)

let mainWindow: BrowserWindow | null = null
let appTray: Tray | null = null
let trackCursorPointInterval: NodeJS.Timeout | undefined

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'AIRI',
    width: 916.0,
    height: 1245.0,
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

  eventaContext = createContext(ipcMain, mainWindow)
  const { context } = eventaContext

  defineInvokeHandler(context, electronStartTrackingCursorPoint, () => {
    trackCursorPointInterval = setInterval(() => {
      const dipPos = screen.getCursorScreenPoint()
      // const pos = screen.dipToScreenPoint(dipPos)
      context.emit(electronCursorPoint, dipPos)
    // mainWindow.webContents.send(electronCursorPoint.id, dipPos)
    }, 32)
  })

  // Create the openSettings invoker once and store it for reuse
  openSettingsInvoker = defineInvoke(context, electronOpenSettings)

  mainWindow.setAlwaysOnTop(true)
  if (isMacOS) {
    mainWindow.setWindowButtonVisibility(false)
  }
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

function createTray(): void {
  if (appTray) {
    return
  }

  const showMainWindow = (): void => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
    }
  }

  // Create tray icon
  appTray = new Tray(icon)

  // Define tray menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: showMainWindow,
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) {
          showMainWindow()
          // Send the open settings command using the pre-created invoker
          if (openSettingsInvoker) {
            openSettingsInvoker(undefined)
          }
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      },
    },
  ])

  // Set tray properties
  appTray.setContextMenu(contextMenu)
  appTray.setToolTip('AIRI - AI Virtual Assistant')
  appTray.addListener('click', showMainWindow)

  // On macOS, there's a special double-click event
  if (platform === 'darwin') {
    appTray.addListener('double-click', showMainWindow)
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if (/^true$/i.test(env.APP_REMOTE_DEBUG || '')) {
    const remoteDebugEndpoint = `http://localhost:${env.APP_REMOTE_DEBUG_PORT || '9222'}`

    http.get(`${remoteDebugEndpoint}/json`, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const targets = JSON.parse(data)
          if (targets.length <= 0) {
            console.warn('[Remote Debugging] No targets found')
            return
          }

          let wsUrl = targets[0].webSocketDebuggerUrl
          if (!wsUrl.startsWith('ws://')) {
            console.warn('[Remote Debugging] Invalid WebSocket URL:', wsUrl)
            return
          }

          wsUrl = wsUrl.substring(5)
          // eslint-disable-next-line no-console
          console.log(`Inspect remotely: ${remoteDebugEndpoint}/devtools/inspector.html?ws=${wsUrl}`)
          shell.openExternal(`${remoteDebugEndpoint}/devtools/inspector.html?ws=${wsUrl}`)
        }
        catch (err) {
          console.error('[Remote Debugging] Failed to parse metadata from /json:', err)
        }
      })
    }).on('error', (err) => {
      console.error('[Remote Debugging] Failed to fetch metadata from /json:', err)
    })
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('ai.moeru.airi')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  createWindow()
  createTray()
}).catch((err) => {
  console.error('Error during app initialization:', err)
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

// Clean up tray when app quits
app.on('before-quit', () => {
  if (appTray) {
    appTray.destroy()
    appTray = null
  }
})
