import { join } from 'node:path'
import { env, platform } from 'node:process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from 'electron'
import { inertia } from 'popmotion'

import icon from '../../build/icon.png?asset'

// FIXME: electron i18n

let globalMouseTracker: ReturnType<typeof setInterval> | null = null
let mainWindow: BrowserWindow
let currentAnimationX: { stop: () => void } | null = null
let currentAnimationY: { stop: () => void } | null = null
let isDragging = false
let lastMousePosition = { x: 0, y: 0 }
let lastMouseTime = Date.now()
let currentVelocity = { x: 0, y: 0 }
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

  ipcMain.on('start-window-drag', (_) => {
    isDragging = true
    const mousePos = screen.getCursorScreenPoint()
    const [windowX, windowY] = mainWindow.getPosition()

    // Calculate the offset between cursor and window position
    dragOffset = {
      x: mousePos.x - windowX,
      y: mousePos.y - windowY,
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

    // Initialize last position for velocity tracking
    lastMousePosition = { x: mousePos.x, y: mousePos.y }
    lastMouseTime = Date.now()
    currentVelocity = { x: 0, y: 0 }

    // Start global mouse tracking
    if (!globalMouseTracker) {
      globalMouseTracker = setInterval(() => {
        const mousePos = screen.getCursorScreenPoint()
        if (isDragging) {
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

    // Apply inertia animation when drag ends
    const [currentX, currentY] = mainWindow.getPosition()
    let latestX = currentX
    let latestY = currentY

    const inertiaConfig = {
      power: 0.4, // Reduced from 0.6 for stronger resistance
      timeConstant: 250, // Reduced from 400 for quicker deceleration
      modifyTarget: (v: number) => v,
      min: 0,
      max: Infinity,
    }

    // Clamp velocity to reasonable values
    const clampVelocity = (v: number) => {
      const maxVelocity = 500 // Reduced from 800 for less momentum
      const minVelocity = -500
      return Math.min(Math.max(v, minVelocity), maxVelocity)
    }

    // Reduce velocity amplification and clamp values
    const amplifiedVelocity = {
      x: clampVelocity(currentVelocity.x * 0.2), // Reduced from 0.3 for less momentum
      y: clampVelocity(currentVelocity.y * 0.2),
    }

    // Ignore very small movements
    if (Math.abs(amplifiedVelocity.x) > 35 || Math.abs(amplifiedVelocity.y) > 35) {
      currentAnimationX = inertia({
        from: currentX,
        velocity: amplifiedVelocity.x,
        ...inertiaConfig,
        onUpdate: (x) => {
          latestX = Math.round(x)
          mainWindow.setPosition(latestX, Math.round(latestY))
        },
        onComplete: () => {
          currentAnimationX = null
        },
      })

      currentAnimationY = inertia({
        from: currentY,
        velocity: amplifiedVelocity.y,
        ...inertiaConfig,
        onUpdate: (y) => {
          latestY = Math.round(y)
          mainWindow.setPosition(Math.round(latestX), latestY)
        },
        onComplete: () => {
          currentAnimationY = null
        },
      })
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

  // Calculate actual velocity based on mouse movement
  const currentTime = Date.now()
  const deltaTime = currentTime - lastMouseTime

  if (deltaTime > 0) {
    // Smooth out velocity calculation with some averaging
    const newVelocityX = (cursorX - lastMousePosition.x) / deltaTime * 1000
    const newVelocityY = (cursorY - lastMousePosition.y) / deltaTime * 1000

    currentVelocity = {
      x: currentVelocity.x * 0.8 + newVelocityX * 0.2, // Smooth velocity
      y: currentVelocity.y * 0.8 + newVelocityY * 0.2,
    }
  }

  // Update window position based on cursor position and offset
  const newX = cursorX - dragOffset.x
  const newY = cursorY - dragOffset.y
  mainWindow.setPosition(Math.round(newX), Math.round(newY))

  lastMousePosition = { x: cursorX, y: cursorY }
  lastMouseTime = currentTime
}
