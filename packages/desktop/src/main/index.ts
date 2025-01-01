import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import icon from '../../resources/icon.png?asset'

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
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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

  if (is.dev) {
    // try to read port number from stage.dev.json
    const devFile = readFileSync(join(__dirname, '../../../stage/stage.dev.json'), 'utf-8')
    const devInfo = JSON.parse(devFile) as { address: { address: string, family: string, port: number } }
    mainWindow.loadURL(`http://localhost:${devInfo.address.port}`).catch((e) => {
      console.error('Failed to load URL', e)
    })
  }
  else {
    mainWindow.loadFile(join(__dirname, '../../../stage/dist/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('moe.ayaka.proj-airi')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  // eslint-disable-next-line no-console
  ipcMain.on('ping', () => console.log('pong'))
  ipcMain.on('quit', () => app.quit())

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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
