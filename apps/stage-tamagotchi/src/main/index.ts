import type { BrowserWindow } from 'electron'

import type { FileLoggerHandle } from './app/file-logger'

import process, { env, platform } from 'node:process'

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import messages from '@proj-airi/i18n/locales'

import { electronApp, optimizer } from '@electron-toolkit/utils'
import { Format, LogLevel, setGlobalFormat, setGlobalHookPostLog, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { hasSelectedScreenCaptureSource, initScreenCaptureForMain } from '@proj-airi/electron-screen-capture/main'
import { app, ipcMain, session } from 'electron'
import { noop } from 'es-toolkit'
import { createLoggLogger, injeca, lifecycle } from 'injeca'
import { isLinux } from 'std-env'

import icon from '../../resources/icon.png?asset'

import { openDebugger, setupDebugger } from './app/debugger'
import { nullFileLoggerHandle, setupFileLogger } from './app/file-logger'
import { resolveIsWayland } from './app/ozone'
import { installSingleInstanceGuard } from './app/single-instance'
import { createArtistryConfig } from './configs/artistry'
import { createGlobalAppConfig } from './configs/global'
import { emitAppBeforeQuit, emitAppReady, emitAppWindowAllClosed } from './libs/bootkit/lifecycle'
import { setElectronMainDirname } from './libs/electron/location'
import { createI18n } from './libs/i18n'
import { setupAppleSpeechTranscriptionService } from './services/airi/apple-speech-transcription'
import { setupServerChannel } from './services/airi/channel-server'
import { setupGodotStageManager } from './services/airi/godot-stage'
import { setupBuiltInServer } from './services/airi/http-server'
import { setupMcpStdioManager } from './services/airi/mcp-servers'
import { setupExtensionHost } from './services/airi/plugins'
import { setupArtistryBridge } from './services/airi/widgets/artistry-bridge'
import { setupAutoUpdater } from './services/electron/auto-updater'
import { setupGlobalShortcutService } from './services/electron/global-shortcut'
import { setupPermissionHandlers } from './services/electron/media-permissions'
import { setupTray } from './tray'
import { setupAboutWindowReusable } from './windows/about'
import { setupBeatSync } from './windows/beat-sync'
import { setupCaptionWindowManager } from './windows/caption'
import { setupChatWindowReusableFunc } from './windows/chat'
import { isDesktopOverlayEnabled, setupDesktopOverlayWindow } from './windows/desktop-overlay'
import { setupDevtoolsWindow } from './windows/devtools'
import { setupEditorWindowManager } from './windows/editor'
import { setupMainWindow } from './windows/main'
import { setupNoticeWindowManager } from './windows/notice'
import { setupOnboardingWindowManager } from './windows/onboarding'
import { setupSettingsWindowReusableFunc } from './windows/settings'
import { setupSpotlightWindowManager } from './windows/spotlight'
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

const appUserDataPath = env.APP_USER_DATA_PATH?.trim()
if (appUserDataPath) {
  app.setPath('userData', appUserDataPath)
}

// Thanks to [@blurymind](https://github.com/blurymind),
//
// When running Electron on Linux, navigator.gpu.requestAdapter() fails.
// In order to enable WebGPU and process the shaders fast enough, we need the following
// command line switches to be set.
//
// https://github.com/electron/electron/issues/41763#issuecomment-2051725363
// https://github.com/electron/electron/issues/41763#issuecomment-3143338995
if (isLinux) {
  // NOTICE:
  // All enabled features must be joined into a single comma-separated string
  // instead of calling appendSwitch('enable-features', ...) once per feature.
  // Root cause: Chromium's commandLine stores switches by key, so each
  // appendSwitch('enable-features', ...) call overwrites the previous value and
  // only the last feature survives.
  // Source: Chromium base::CommandLine behavior; see
  // https://github.com/electron/electron/issues/41763 for the WebGPU setup this supports.
  // Removal condition: never for the join itself; this block can be deleted once
  // WebGPU works on Linux Electron without manual feature switches.
  const enabledFeatures = [
    'SharedArrayBuffer',
  ]

  app.commandLine.appendSwitch('enable-unsafe-webgpu')

  // Check explicit command-line switches before falling back to session environment variables.
  // When running with XWayland (e.g. '--ozone-platform=x11'), session variables like WAYLAND_DISPLAY
  // are still inherited from the Wayland desktop, but Chromium uses the explicitly specified Ozone backend.
  // Treat explicit 'auto' as an unresolved platform selection and resolve using session environment variables.
  const isWayland = resolveIsWayland({
    explicitOzonePlatform: app.commandLine.getSwitchValue('ozone-platform'),
    ozonePlatformHint: app.commandLine.getSwitchValue('ozone-platform-hint'),
    env,
  })

  if (isWayland) {
    enabledFeatures.push('GlobalShortcutsPortal', 'UseOzonePlatform', 'WaylandWindowDecorations')
    if (!app.commandLine.hasSwitch('ozone-platform-hint')) {
      app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
    }
  }
  else {
    // NOTICE:
    // Vulkan must only be enabled on non-Wayland sessions, otherwise GPU
    // initialization fails or rendering glitches appear.
    // Root cause: Vulkan is incompatible with '--ozone-platform=wayland' in
    // Chromium's surface factory; the Wayland Ozone backend cannot present
    // Vulkan surfaces.
    // Source: Chromium Ozone/Wayland surface factory; workaround tracked via
    // https://github.com/electron/electron/issues/41763 (WebGPU on Linux).
    // Removal condition: when Chromium/Electron supports Vulkan with the Wayland
    // Ozone backend, drop the isWayland guard and always push 'Vulkan'.
    enabledFeatures.push('Vulkan')
  }

  app.commandLine.appendSwitch('enable-features', enabledFeatures.join(','))
}

app.dock?.setIcon(icon)
electronApp.setAppUserModelId('ai.moeru.airi')

// Track the real user-facing AIRI window because the process also owns hidden utility windows.
// The second-instance handler should restore the main UI instead of accidentally surfacing internals.
let userFacingMainWindow: BrowserWindow | undefined
const shouldStartMainProcess = installSingleInstanceGuard({ app, getWindow: () => userFacingMainWindow })

if (shouldStartMainProcess) {
  initScreenCaptureForMain()
}

let fileLogger: FileLoggerHandle = nullFileLoggerHandle
let skipFileLogging = false

app.whenReady().then(async () => {
  if (!shouldStartMainProcess) {
    return
  }

  setupPermissionHandlers(session.defaultSession, hasSelectedScreenCaptureSource)

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
  const artistryConfig = injeca.provide('configs:artistry', () => createArtistryConfig())
  const electronApp = injeca.provide('host:electron:app', () => app)
  const autoUpdater = injeca.provide('services:auto-updater', {
    dependsOn: { appConfig },
    build: ({ dependsOn }) => setupAutoUpdater({
      enabled: import.meta.env.VITE_DISTRIBUTION !== 'steam',
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

  const airiHttpServer = injeca.provide('modules:airi-http-server', {
    build: async () => setupBuiltInServer({ servers: [] }),
  })

  const godotStageManager = injeca.provide('modules:godot-stage-manager', {
    build: async () => setupGodotStageManager(),
  })

  const appleSpeechTranscription = injeca.provide('modules:apple-speech-transcription', {
    dependsOn: { lifecycle },
    build: ({ dependsOn }) => setupAppleSpeechTranscriptionService(dependsOn),
  })

  const mcpStdioManager = injeca.provide('modules:mcp-stdio-manager', {
    build: async () => setupMcpStdioManager(),
  })

  const widgetsManager = injeca.provide('windows:widgets', {
    dependsOn: { serverChannel, i18n },
    build: ({ dependsOn }) => setupWidgetsWindowManager(dependsOn),
  })

  const pluginHost = injeca.provide('modules:plugin-host', {
    dependsOn: { serverChannel, widgetsManager },
    build: ({ dependsOn }) => setupExtensionHost(dependsOn),
  })

  const globalShortcut = injeca.provide('services:global-shortcut', () => setupGlobalShortcutService())

  // Beat Sync uses a background renderer because Web Audio processing needs a DOM runtime.
  const beatSync = injeca.provide('windows:beat-sync', () => setupBeatSync())

  const devtoolsMarkdownStressWindow = injeca.provide('windows:devtools:markdown-stress', () => setupDevtoolsWindow())

  const onboardingWindowManager = injeca.provide('windows:onboarding', {
    dependsOn: { serverChannel, i18n },
    build: ({ dependsOn }) => setupOnboardingWindowManager(dependsOn),
  })

  const noticeWindow = injeca.provide('windows:notice', {
    dependsOn: { i18n, serverChannel },
    build: ({ dependsOn }) => setupNoticeWindowManager(dependsOn),
  })

  const aboutWindow = injeca.provide('windows:about', {
    dependsOn: { autoUpdater, i18n, serverChannel },
    build: ({ dependsOn }) => setupAboutWindowReusable(dependsOn),
  })

  const chatWindow = injeca.provide('windows:chat', {
    dependsOn: { widgetsManager, serverChannel, mcpStdioManager, i18n },
    build: ({ dependsOn }) => setupChatWindowReusableFunc(dependsOn),
  })

  const spotlightWindow = injeca.provide('windows:spotlight', {
    dependsOn: { serverChannel, i18n, chatWindow, globalShortcut, appConfig },
    build: ({ dependsOn }) => setupSpotlightWindowManager(dependsOn),
  })

  const editorWindow = injeca.provide('windows:editor', {
    dependsOn: { serverChannel, i18n },
    build: ({ dependsOn }) => setupEditorWindowManager(dependsOn),
  })

  const settingsWindow = injeca.provide('windows:settings', {
    dependsOn: { widgetsManager, beatSync, autoUpdater, devtoolsWindow: devtoolsMarkdownStressWindow, serverChannel, godotStageManager, mcpStdioManager, i18n, globalShortcut, spotlightWindow },
    build: async ({ dependsOn }) =>
      setupSettingsWindowReusableFunc({
        ...dependsOn,
        getMainWindow: () => userFacingMainWindow,
      }),
  })

  const mainWindow = injeca.provide('windows:main', {
    dependsOn: { editorWindow, settingsWindow, chatWindow, widgetsManager, noticeWindow, beatSync, autoUpdater, serverChannel, godotStageManager, mcpStdioManager, i18n, onboardingWindowManager, appleSpeechTranscription },
    build: async ({ dependsOn }) => setupMainWindow({
      ...dependsOn,
      onWindowCreated: (window) => {
        userFacingMainWindow = window
      },
    }),
  })

  const captionWindow = injeca.provide('windows:caption', {
    dependsOn: { mainWindow, serverChannel, i18n },
    build: async ({ dependsOn }) => setupCaptionWindowManager(dependsOn),
  })

  const tray = injeca.provide('app:tray', {
    dependsOn: { mainWindow, settingsWindow, captionWindow, widgetsWindow: widgetsManager, serverChannel, beatSyncBgWindow: beatSync, aboutWindow, i18n },
    build: async ({ dependsOn }) => setupTray(dependsOn),
  })

  // Desktop grounding overlay — gated by AIRI_DESKTOP_OVERLAY=1
  if (isDesktopOverlayEnabled()) {
    const desktopOverlay = injeca.provide('windows:desktop-overlay', {
      dependsOn: { mcpStdioManager, serverChannel, i18n },
      build: async ({ dependsOn }) => setupDesktopOverlayWindow(dependsOn),
    })

    // NOTICE: Separate invoke ensures the overlay is eagerly built.
    // Without this, injeca.start() would skip it because no other
    // provider depends on 'windows:desktop-overlay'.
    injeca.invoke({
      dependsOn: { desktopOverlay },
      callback: noop,
    })
  }

  injeca.invoke({
    dependsOn: { mainWindow, tray, serverChannel, airiHttpServer, godotStageManager, pluginHost, mcpStdioManager, onboardingWindow: onboardingWindowManager, widgetsWindow: widgetsManager, spotlightWindow, artistryConfig },
    callback: async (deps) => {
      const { context } = createContext(ipcMain)
      await setupArtistryBridge({
        widgetsManager: deps.widgetsWindow,
        context,
        artistryConfig: deps.artistryConfig,
      })
    },
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

  if (!exitedNormally) {
    app.exit(1)
  }
  else {
    app.quit()
  }
}

process.on('SIGINT', () => handleAppExit())

app.on('before-quit', (event) => {
  if (appExiting)
    return

  event.preventDefault()
  handleAppExit()
})
