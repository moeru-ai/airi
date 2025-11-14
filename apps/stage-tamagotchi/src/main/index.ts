import type { BrowserWindow } from 'electron'

import type { WidgetsWindowManager } from './windows/widgets'

import { platform } from 'node:process'

import { electronApp, optimizer } from '@electron-toolkit/utils'
import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { createLoggLogger, injecta } from '@proj-airi/injecta'
import { app, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { noop, once } from 'es-toolkit'
import { isLinux, isMacOS } from 'std-env'

import icon from '../../resources/icon.png?asset'
import macOSTrayIcon from '../../resources/tray-icon-macos.png?asset'

import { openDebugger, setupDebugger } from './app/debugger'
import { emitAppBeforeQuit, emitAppReady, emitAppWindowAllClosed, onAppBeforeQuit } from './libs/bootkit/lifecycle'
import { setElectronMainDirname } from './libs/electron/location'
import { setupChannelServer } from './services/airi/channel-server'
import { setupCaptionWindowManager } from './windows/caption'
import { setupChatWindowReusableFunc } from './windows/chat'
import { setupInlayWindow } from './windows/inlay'
import { setupMainWindow } from './windows/main'
import { setupSettingsWindowReusableFunc } from './windows/settings'
import { toggleWindowShow } from './windows/shared/window'
import { setupWidgetsWindowManager } from './windows/widgets'

// TODO: once we refactored eventa to support window-namespaced contexts,
// we can remove the setMaxListeners call below since eventa will be able to dispatch and
// manage events within eventa's context system.
ipcMain.setMaxListeners(100)

setElectronMainDirname(__dirname)
setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
setupDebugger()

const log = useLogg('main').useGlobalConfig()

// Thanks to [@blurymind](https://github.com/blurymind),
//
// When running Electron on Linux, navigator.gpu.requestAdapter() fails.
// In order to enable WebGPU and process the shaders fast enough, we need the following
// command line switches to be set.
//
// https://github.com/electron/electron/issues/41763#issuecomment-2051725363
// https://github.com/electron/electron/issues/41763#issuecomment-3143338995
if (isLinux) {
  app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')
  app.commandLine.appendSwitch('enable-unsafe-webgpu')
  app.commandLine.appendSwitch('enable-features', 'Vulkan')
}

app.dock?.setIcon(icon)
electronApp.setAppUserModelId('ai.moeru.airi')

function setupTray(params: {
  mainWindow: BrowserWindow
  settingsWindow: () => Promise<BrowserWindow>
  captionWindow: ReturnType<typeof setupCaptionWindowManager>
  widgetsWindow: WidgetsWindowManager
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
      { label: 'Quit', click: () => app.quit() },
    ])

    appTray.setContextMenu(contextMenu)
    appTray.setToolTip('Project AIRI')
    appTray.addListener('click', () => toggleWindowShow(params.mainWindow))

    // On macOS, there's a special double-click event
    if (isMacOS)
      appTray.addListener('double-click', () => toggleWindowShow(params.mainWindow))
  })()
}

app.whenReady().then(async () => {
  injecta.setLogger(createLoggLogger(useLogg('injecta').useGlobalConfig()))

  const channelServerModule = injecta.provide('modules:channel-server', async () => setupChannelServer())
  const chatWindow = injecta.provide('windows:chat', { build: () => setupChatWindowReusableFunc() })
  const widgetsManager = injecta.provide('windows:widgets', { build: () => setupWidgetsWindowManager() })

  const settingsWindow = injecta.provide('windows:settings', {
    dependsOn: { widgetsManager },
    build: ({ dependsOn }) => setupSettingsWindowReusableFunc(dependsOn),
  })
  const mainWindow = injecta.provide('windows:main', {
    dependsOn: { settingsWindow, chatWindow, widgetsManager },
    build: async ({ dependsOn }) => setupMainWindow(dependsOn),
  })
  const captionWindow = injecta.provide('windows:caption', {
    dependsOn: { mainWindow },
    build: async ({ dependsOn }) => setupCaptionWindowManager(dependsOn),
  })
  const tray = injecta.provide('app:tray', {
    dependsOn: { mainWindow, settingsWindow, captionWindow, widgetsWindow: widgetsManager },
    build: async ({ dependsOn }) => setupTray(dependsOn),
  })
  injecta.invoke({
    dependsOn: { mainWindow, tray, channelServerModule },
    callback: noop,
  })

  injecta.start().catch(err => console.error(err))

  // Lifecycle
  emitAppReady()

  // Extra
  openDebugger()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
}).catch((err) => {
  log.withError(err).error('Error during app initialization')
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  emitAppWindowAllClosed()

  if (platform !== 'darwin') {
    app.quit()
  }
})

// Clean up server and intervals when app quits
app.on('before-quit', async () => {
  emitAppBeforeQuit()
  injecta.stop()
})
