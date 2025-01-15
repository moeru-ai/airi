import { join } from 'node:path'
import { env, platform } from 'node:process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import icon from '../../build/icon.png?asset'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 300,
    height: 400,
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

  ipcMain.on('move-window', (_, dx, dy) => {
    const [currentX, currentY] = mainWindow.getPosition()
    mainWindow.setPosition(currentX + dx, currentY + dy)
  })
}

let settingsWindow: BrowserWindow | null = null

function createSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.show()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 300,
    height: 400,
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
