import type { FileLoggerHandle } from './app/file-logger'

import process, { env, platform } from 'node:process'

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import messages from '@proj-airi/i18n/locales'

import { electronApp, optimizer } from '@electron-toolkit/utils'
import { Format, LogLevel, setGlobalFormat, setGlobalHookPostLog, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { initScreenCaptureForMain } from '@proj-airi/electron-screen-capture/main'
import { app, ipcMain } from 'electron'
import { noop } from 'es-toolkit'
import { createLoggLogger, injeca, lifecycle } from 'injeca'
import { isLinux } from 'std-env'

import icon from '../../resources/icon.png?asset'

import { openDebugger, setupDebugger } from './app/debugger'
import { nullFileLoggerHandle, setupFileLogger } from './app/file-logger'
import { createGlobalAppConfig } from './configs/global'
import { emitAppBeforeQuit, emitAppReady, emitAppWindowAllClosed } from './libs/bootkit/lifecycle'
import { setElectronMainDirname } from './libs/electron/location'
import { createI18n } from './libs/i18n'
import { createWindowAuthManagerService } from './services/airi/auth'
import { setupServerChannel } from './services/airi/channel-server'
import { setupMcpStdioManager } from './services/airi/mcp-servers'
import { setupPluginHost } from './services/airi/plugins'
import { setupAutoUpdater } from './services/electron/auto-updater'
import { setupTray } from './tray'
import { setupAboutWindowReusable } from './windows/about'
import { setupBeatSync } from './windows/beat-sync'
import { setupCaptionWindowManager } from './windows/caption'
import { setupChatWindowReusableFunc } from './windows/chat'
import { setupDevtoolsWindow } from './windows/devtools'
import { setupMainWindow } from './windows/main'
import { setupNoticeWindowManager } from './windows/notice'
import { setupOnboardingWindowManager } from './windows/onboarding'
import { setupSettingsWindowReusableFunc } from './windows/settings'
import { setupWidgetsWindowManager } from './windows/widgets'

// TODO: once we refactored eventa to support window-namespaced contexts,
// we can remove the setMaxListeners call below since eventa will be able to dispatch and
// manage events within eventa's context system.
ipcMain.setMaxListeners(100)

setElectronMainDirname(dirname(fileURLToPath(import.meta.url)))
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

  // NOTICE: we need UseOzonePlatform, WaylandWindowDecorations for working on Wayland.
  // Partially related to https://github.com/electron/electron/issues/41551, since X11 is deprecating now,
  // we can safely remove the feature flags for Electron once they made it default supported.
  // Fixes: https://github.com/moeru-ai/airi/issues/757
  // Ref: https://github.com/mmaura/poe2linuxcompanion/blob/90664607a147ea5ccea28df6139bd95fb0ebab0e/electron/main/index.ts#L28-L46
  if (env.XDG_SESSION_TYPE === 'wayland') {
    app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')

    app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform')
    app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations')
  }
}

app.dock?.setIcon(icon)
electronApp.setAppUserModelId('ai.moeru.airi')

initScreenCaptureForMain()

let fileLogger: FileLoggerHandle = nullFileLoggerHandle
let skipFileLogging = false

app.whenReady().then(async () => {
  // Initialize file logger and register the hook
  fileLogger = await setupFileLogger()

  // Register the global hook for file logging
  setGlobalHookPostLog((_, formatted) => {
    if (skipFileLogging || fileLogger.logFileFd === null)
      return
    void fileLogger.appendLog(formatted)
  })

  injeca.setLogger(createLoggLogger(useLogg('injeca').useGlobalConfig()))

  const appConfig = injeca.provide('configs:app', () => createGlobalAppConfig())
  const electronApp = injeca.provide('host:electron:app', () => app)
  const autoUpdater = injeca.provide('services:auto-updater', {
    dependsOn: { appConfig },
    build: ({ dependsOn }) => setupAutoUpdater({
      getStoredUpdateLane: () => dependsOn.appConfig.get()?.updateChannel,
      setStoredUpdateLane: (lane) => {
        const currentConfig = dependsOn.appConfig.get()
        dependsOn.appConfig.update({
          language: currentConfig?.language ?? 'en',
          updateChannel: lane,
        })
      },
    }),
  })

  const i18n = injeca.provide('libs:i18n', {
    dependsOn: { appConfig },
    build: ({ dependsOn }) => createI18n({ messages, locale: dependsOn.appConfig.get()?.language }),
  })

  const serverChannel = injeca.provide('modules:channel-server', {
    dependsOn: { app: electronApp, lifecycle },
    build: async ({ dependsOn }) => setupServerChannel(dependsOn),
  })

  const mcpStdioManager = injeca.provide('modules:mcp-stdio-manager', {
    build: async () => setupMcpStdioManager(),
  })

  const pluginHost = injeca.provide('modules:plugin-host', {
    dependsOn: { serverChannel },
    build: () => setupPluginHost(),
  })

  const windowAuthManager = injeca.provide('services:window-auth-manager', () => createWindowAuthManagerService())

  // BeatSync will create a background window to capture and process audio.
  const beatSync = injeca.provide('windows:beat-sync', () => setupBeatSync())

  const devtoolsWindow = injeca.provide('windows:devtools', () => setupDevtoolsWindow())

  const onboardingWindowManager = injeca.provide('windows:onboarding', {
    dependsOn: { serverChannel, i18n, windowAuthManager },
    build: ({ dependsOn }) => setupOnboardingWindowManager(dependsOn),
  })

  const noticeWindow = injeca.provide('windows:notice', {
    dependsOn: { i18n, serverChannel },
    build: ({ dependsOn }) => setupNoticeWindowManager(dependsOn),
  })

  const widgetsManager = injeca.provide('windows:widgets', {
    dependsOn: { serverChannel, i18n },
    build: ({ dependsOn }) => setupWidgetsWindowManager(dependsOn),
  })

  const aboutWindow = injeca.provide('windows:about', {
    dependsOn: { autoUpdater, i18n, serverChannel },
    build: ({ dependsOn }) => setupAboutWindowReusable(dependsOn),
  })

  const chatWindow = injeca.provide('windows:chat', {
    dependsOn: { widgetsManager, serverChannel, mcpStdioManager, i18n },
    build: ({ dependsOn }) => setupChatWindowReusableFunc(dependsOn),
  })

  const settingsWindow = injeca.provide('windows:settings', {
    dependsOn: { widgetsManager, beatSync, autoUpdater, devtoolsWindow, serverChannel, mcpStdioManager, i18n, windowAuthManager },
    build: async ({ dependsOn }) => setupSettingsWindowReusableFunc(dependsOn),
  })

  const mainWindow = injeca.provide('windows:main', {
    dependsOn: { settingsWindow, chatWindow, widgetsManager, noticeWindow, beatSync, autoUpdater, serverChannel, mcpStdioManager, i18n, onboardingWindowManager, windowAuthManager },
    build: async ({ dependsOn }) => setupMainWindow(dependsOn),
  })

  const captionWindow = injeca.provide('windows:caption', {
    dependsOn: { mainWindow, serverChannel, i18n },
    build: async ({ dependsOn }) => setupCaptionWindowManager(dependsOn),
  })

  const tray = injeca.provide('app:tray', {
    dependsOn: { mainWindow, settingsWindow, captionWindow, widgetsWindow: widgetsManager, serverChannel, beatSyncBgWindow: beatSync, aboutWindow, i18n },
    build: async ({ dependsOn }) => setupTray(dependsOn),
  })

  injeca.invoke({
    dependsOn: { mainWindow, tray, serverChannel, pluginHost, mcpStdioManager, onboardingWindow: onboardingWindowManager },
    callback: noop,
  })

  injeca.start().catch(err => console.error(err))

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

let appExiting = false

// Clean up server and intervals when app quits
async function handleAppExit() {
  if (appExiting)
    return

  appExiting = true

  let exitedNormally = true

  /**
   * Safely execute fn and log any errors that occur, marking the exit as abnormal
   * if an error is caught.
   *
   * @param operation - A verb phrase describing the operation.
   * @param fn - Any function to execute. It can be either sync or async.
   * @returns A promise that resolves when the operation is complete.
   */
  async function logIfError(operation: string, fn: () => unknown): Promise<void> {
    try {
      await fn()
    }
    catch (error) {
      exitedNormally = false
      log.withError(error).error(`[app-exit] Failed to ${operation}:`)
    }
  }

  await Promise.all([
    logIfError('execute onAppBeforeQuit hooks', () => emitAppBeforeQuit()),
    logIfError('stop injeca', () => injeca.stop()),
  ])

  // Prevent the global log hook from trying to write to the file after close() is called,
  // which would cause a recursive failure if close() itself throws.
  skipFileLogging = true
  await logIfError('flush file logs', () => fileLogger.close()) // Ensure all logs are flushed

  app.exit(exitedNormally ? 0 : 1)
}

process.on('SIGINT', () => handleAppExit())

app.on('before-quit', (event) => {
  event.preventDefault()
  handleAppExit()
})
