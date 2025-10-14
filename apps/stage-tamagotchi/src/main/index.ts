import type http from 'node:http'

import type { BrowserWindow } from 'electron'

import { platform } from 'node:process'

import { electronApp, optimizer } from '@electron-toolkit/utils'
import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { createLoggLogger, injecta } from '@proj-airi/injecta'
import { app, Menu, nativeImage, Tray } from 'electron'
import { noop, once } from 'es-toolkit'
import { isLinux, isMacOS } from 'std-env'

import icon from '../../resources/icon.png?asset'
import macOSTrayIcon from '../../resources/tray-icon-macos.png?asset'

import { openDebugger, setupDebugger } from './app/debugger'
import { emitAppBeforeQuit, emitAppReady, emitAppWindowAllClosed, onAppBeforeQuit } from './libs/bootkit/lifecycle'
import { setElectronMainDirname } from './libs/electron/location'
import { setupInlayWindow } from './windows/inlay'
import { setupMainWindow } from './windows/main'
import { setupSettingsWindowReusableFunc } from './windows/settings'
import { toggleWindowShow } from './windows/shared/window'

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
}): void {
  once(() => {
    const appTray = new Tray(nativeImage.createFromPath(macOSTrayIcon).resize({ width: 16 }))
    onAppBeforeQuit(() => appTray.destroy())

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show', click: () => toggleWindowShow(params.mainWindow) },
      { label: 'Inlay', click: () => setupInlayWindow() },
      { type: 'separator' },
      { label: 'Settings', click: () => params.settingsWindow().then(window => toggleWindowShow(window)) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])

    appTray.setContextMenu(contextMenu)
    appTray.setToolTip('Project AIRI')
    appTray.addListener('click', () => toggleWindowShow(params.mainWindow))
    // On macOS, there's a special double-click event
    isMacOS && appTray.addListener('double-click', () => toggleWindowShow(params.mainWindow))
  })()
}

async function setupProjectAIRIServerRuntime() {
  // Start the server-runtime server with WebSocket support
  try {
    // Dynamically import the server-runtime and listhen
    const [serverRuntimeModule, { listen }] = await Promise.all([
      import('@proj-airi/server-runtime'),
      import('listhen'),
    ])

    const serverInstance = await listen(serverRuntimeModule.app as unknown as http.RequestListener, {
      port: 6121,
      hostname: 'localhost',
      ws: true,
    })

    log.log('@proj-airi/server-runtime started on ws://localhost:6121')

    onAppBeforeQuit(async () => {
      if (serverInstance && typeof serverInstance.close === 'function') {
        try {
          await serverInstance.close()
          log.log('WebSocket server closed')
        }
        catch (error) {
          log.withError(error).error('Error closing WebSocket server')
        }
      }
    })
  }
  catch (error) {
    log.withError(error).error('failed to start WebSocket server')
  }
}

app.whenReady().then(async () => {
  await setupProjectAIRIServerRuntime()

  injecta.setLogger(createLoggLogger())
  injecta.provide('windows:settings', () => setupSettingsWindowReusableFunc())
  injecta.provide<{ settingsWindow: () => Promise<BrowserWindow> }>('windows:main', { dependsOn: { settingsWindow: 'windows:settings' }, build: async ({ dependsOn }) => setupMainWindow(dependsOn) })
  injecta.provide<{ mainWindow: BrowserWindow, settingsWindow: () => Promise<BrowserWindow> }>('tray', { dependsOn: { mainWindow: 'windows:main', settingsWindow: 'windows:settings' }, build: async ({ dependsOn }) => setupTray(dependsOn) })
  injecta.invoke({ dependsOn: { mainWindow: 'windows:main', tray: 'tray' }, callback: noop })
  injecta.start()

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
})
