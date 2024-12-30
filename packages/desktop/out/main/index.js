'use strict'
const node_path = require('node:path')
const path = require('node:path')
const process = require('node:process')
const utils = require('@electron-toolkit/utils')
const electron = require('electron')

const icon = path.join(__dirname, '../../resources/icon.png')
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === 'linux' ? { icon } : {},
    webPreferences: {
      preload: node_path.join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (utils.is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  }
  else {
    mainWindow.loadFile(node_path.join(__dirname, '../../../stage/dist/index.html'))
  }
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId('moe.ayaka.proj-airi')
  electron.app.on('browser-window-created', (_, window) => {
    utils.optimizer.watchWindowShortcuts(window)
  })
  // eslint-disable-next-line no-console
  electron.ipcMain.on('ping', () => console.log('pong'))
  createWindow()
  electron.app.on('activate', () => {
    if (electron.BrowserWindow.getAllWindows().length === 0)
      createWindow()
  })
})
electron.app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    electron.app.quit()
  }
})
