import { join } from 'node:path'
import { env, platform } from 'node:process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from 'electron'
import { animate } from 'popmotion'

import icon from '../../build/icon.png?asset'

let globalMouseTracker: ReturnType<typeof setInterval> | null = null
let mainWindow: BrowserWindow
let currentAnimationX: { stop: () => void } | null = null
let currentAnimationY: { stop: () => void } | null = null
let isDragging = false
let dragOffset = { x: 0, y: 0 }

function createWindow(): void {
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

  ipcMain.on('start-window-drag', (_, clickX: number, clickY: number) => {
    isDragging = true
    dragOffset = {
      x: clickX,
      y: clickY,
    }

    // Stop any existing animations
    if (currentAnimationX) {
      currentAnimationX.stop()
      currentAnimationX = null
    }
    if (currentAnimationY) {
      currentAnimationY.stop()
      currentAnimationY = null
    }

    // Start global mouse tracking
    if (!globalMouseTracker) {
      globalMouseTracker = setInterval(() => {
        const mousePos = screen.getCursorScreenPoint()
        if (isDragging) {
          // Simulate move-window event with global cursor position
          handleWindowMove(mousePos.x, mousePos.y)
        }
      }, 16) // ~60fps
    }
  })

  ipcMain.on('end-window-drag', () => {
    isDragging = false
    if (globalMouseTracker) {
      clearInterval(globalMouseTracker)
      globalMouseTracker = null
    }
  })

  ipcMain.on('move-window', (_, cursorX: number, cursorY: number) => {
    handleWindowMove(cursorX, cursorY)
  })
}

let settingsWindow: BrowserWindow | null = null

function createSettingsWindow(): void {
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
  // Menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'airi',
      role: 'appMenu',
      submenu: [
        {
          role: 'about',
        },
        {
          role: 'toggleDevTools',
        },
        {
          label: 'Settings',
          click: () => createSettingsWindow(),
        },
        {
          label: 'Quit',
          click: () => app.quit(),
        },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.github.moeru-ai.airi-tamagotchi')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  // TODO: i18n
  ipcMain.on('quit', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Quit',
      message: 'Are you sure you want to quit?',
      buttons: ['Quit', 'Cancel'],
    }).then((result) => {
      if (result.response === 0) {
        app.quit()
      }
    })
  })

  ipcMain.on('open-settings', () => createSettingsWindow())

  createWindow()

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.

function handleWindowMove(cursorX: number, cursorY: number) {
  if (!isDragging)
    return

  // Stop current animations
  if (currentAnimationX)
    currentAnimationX.stop()
  if (currentAnimationY)
    currentAnimationY.stop()

  const targetX = cursorX - dragOffset.x
  const targetY = cursorY - dragOffset.y
  const [currentX, currentY] = mainWindow.getPosition()
  let latestX = currentX
  let latestY = currentY

  // Shared animation config for squishie bounce effect
  const springConfig = {
    stiffness: 2000, // Reduced for more elastic feel
    damping: 100, // Lower damping for more bounces
    mass: 0.5, // Higher mass for more momentum
    restSpeed: 0.1, // Lower rest speed to allow more bouncing
  }

  currentAnimationX = animate({
    from: currentX,
    to: targetX,
    type: 'spring',
    ...springConfig,
    onUpdate: (x) => {
      latestX = x
      mainWindow.setPosition(Math.round(latestX), Math.round(latestY))
    },
    onComplete: () => {
      currentAnimationX = null
    },
  })

  currentAnimationY = animate({
    from: currentY,
    to: targetY,
    type: 'spring',
    ...springConfig,
    onUpdate: (y) => {
      latestY = y
      mainWindow.setPosition(Math.round(latestX), Math.round(latestY))
    },
    onComplete: () => {
      currentAnimationY = null
    },
  })
}
