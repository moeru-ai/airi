import { dirname } from 'node:path'
import { env, platform, stderr, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'

import messages from '@proj-airi/i18n/locales'

import { electronApp, optimizer } from '@electron-toolkit/utils'
import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { initScreenCaptureForMain } from '@proj-airi/electron-screen-capture/main'
import { app, ipcMain } from 'electron'
import { createLoggLogger, injeca, lifecycle } from 'injeca'
import { isLinux } from 'std-env'

import icon from '../../resources/icon.png?asset'

import { openDebugger, setupDebugger } from './app/debugger'
import { createGlobalAppConfig } from './configs/global'
import { emitAppBeforeQuit, emitAppReady, emitAppWindowAllClosed } from './libs/bootkit/lifecycle'
import { setElectronMainDirname } from './libs/electron/location'
import { createI18n } from './libs/i18n'
import { createServerChannelService, setupServerChannel } from './services/airi/channel-server'
import { createI18nService } from './services/airi/i18n'
import { createMcpServersService, setupMcpStdioManager } from './services/airi/mcp-servers'
import { setupPluginHost } from './services/airi/plugins'
import { createMicToggleService } from './services/airi/shortcuts/mic-toggle'
import { setupAutoUpdater } from './services/electron/auto-updater'
import { setupSensorsService } from './services/sensors'
import { cleanupMicToggleShortcut } from './services/shortcuts/mic-toggle'
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

function installStreamErrorGuards() {
  const guard = (error: NodeJS.ErrnoException) => {
    // Ignore broken pipe style errors from detached/closed console streams.
    if (error?.code === 'EPIPE' || error?.code === 'ERR_STREAM_DESTROYED') {
      return
    }

    // NOTICE: Attaching an 'error' listener marks the error as handled.
    // Re-throw unexpected stream errors so they still surface during development and crash reporting.
    throw error
  }

  stdout?.on('error', guard)
  stderr?.on('error', guard)
}

// TODO: once we refactored eventa to support window-namespaced contexts,
// we can remove the setMaxListeners call below since eventa will be able to dispatch and
// manage events within eventa's context system.
ipcMain.setMaxListeners(100)

installStreamErrorGuards()
setElectronMainDirname(dirname(fileURLToPath(import.meta.url)))
setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
setupDebugger()

const log = useLogg('main').useGlobalConfig()
const forceHighPerformanceGpu = env.AIRI_FORCE_HIGH_PERFORMANCE_GPU === '1'

if (isLinux) {
  app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')
  app.commandLine.appendSwitch('enable-unsafe-webgpu')
  app.commandLine.appendSwitch('enable-features', 'Vulkan')

  if (env.XDG_SESSION_TYPE === 'wayland') {
    app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')
    app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform')
    app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations')
  }
}

if (forceHighPerformanceGpu) {
  // NOTICE: These switches can materially change GPU selection, power draw, and
  // driver compatibility. Keep them opt-in so default desktop behavior stays
  // close to upstream unless the local launcher explicitly asks for them.
  app.commandLine.appendSwitch('force-high-performance-gpu')
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  console.log('[AIRI] High-performance GPU overrides enabled via AIRI_FORCE_HIGH_PERFORMANCE_GPU=1')
}

app.dock?.setIcon(icon)
electronApp.setAppUserModelId('ai.moeru.airi')

initScreenCaptureForMain()

app.whenReady().then(async () => {
  injeca.setLogger(createLoggLogger(useLogg('injeca').useGlobalConfig()))

  const appConfig = injeca.provide('configs:app', () => createGlobalAppConfig())
  const electronApp = injeca.provide('host:electron:app', () => app)
  const autoUpdater = injeca.provide('services:auto-updater', () => setupAutoUpdater())

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
    dependsOn: { widgetsManager, beatSync, autoUpdater, devtoolsMarkdownStressWindow, serverChannel, mcpStdioManager, i18n },
    build: async ({ dependsOn }) => setupSettingsWindowReusableFunc(dependsOn),
  })

  const mainWindow = injeca.provide('windows:main', {
    dependsOn: { settingsWindow, chatWindow, widgetsManager, noticeWindow, beatSync, autoUpdater, serverChannel, mcpStdioManager, i18n, onboardingWindowManager, appConfig },
    build: async ({ dependsOn }) => setupMainWindow(dependsOn),
  })

  const captionWindow = injeca.provide('windows:caption', {
    dependsOn: { mainWindow, serverChannel, i18n },
    build: async ({ dependsOn }) => setupCaptionWindowManager(dependsOn),
  })

  const tray = injeca.provide('app:tray', {
    dependsOn: { mainWindow, settingsWindow, captionWindow, widgetsWindow: widgetsManager, serverChannel, beatSyncBgWindow: beatSync, aboutWindow, i18n, appConfig },
    build: async ({ dependsOn }) => {
      // Start global OS sensor hooks
      setupSensorsService()

      const configHelper = dependsOn.appConfig
      return setupTray({
        ...dependsOn,
        getConfig: () => configHelper.get(),
        updateConfig: config => configHelper.update(config),
      })
    },
  })

  injeca.invoke({
    dependsOn: { mainWindow, tray, serverChannel, pluginHost, mcpStdioManager, onboardingWindow: onboardingWindowManager, appConfig, i18n },
    callback: (deps) => {
      const context = createContext(ipcMain).context
      createServerChannelService({ serverChannel: deps.serverChannel })
      createMcpServersService({ context, manager: deps.mcpStdioManager })
      createI18nService({ context, window: deps.mainWindow, i18n: deps.i18n })
      createMicToggleService({ context, window: deps.mainWindow })

      import('./libs/bootkit/lifecycle').then((m) => {
        m.onAppBeforeQuit(() => {
          deps.appConfig.flush()
        })
      })

      ipcMain.on('provider-validation-result', (_, data: { providerId: string, valid: boolean, reason: string, config: any }) => {
        if (data.valid)
          return

        const status = 'FAIL'
        const color = '\x1B[31m'
        const reset = '\x1B[0m'
        console.log(`${color}[Provider Validation]${reset} [${data.providerId}] ${status}`)
        if (!data.valid) {
          console.log(`  └─ Reason: ${data.reason}`)
        }
        if (data.config && (data.valid || !data.reason?.includes('required'))) {
          console.log(`  └─ Config: ${JSON.stringify(data.config)}`)
        }
      })

      ipcMain.on('llm-raw-output', (_, data: { type: 'delta' | 'full', text: string, sessionId: string }) => {
        const reset = '\x1B[0m'
        const cyan = '\x1B[36m'
        // const yellow = '\x1B[33m'
        if (data.type === 'delta') {
          /*
          // Log deltas in yellow, but only if they are not just whitespace (too noisy otherwise)
          if (data.text.trim()) {
            console.log(`${yellow}[LLM Delta]${reset} ${data.text}`)
          }
          */
        }
        else {
          console.log(`${cyan}[LLM Final Output]${reset} Session: ${data.sessionId}`)
          console.log(`----------------------------------------`)
          console.log(data.text)
          console.log(`----------------------------------------`)
        }
      })
    },
  })

  injeca.start().catch(err => console.error(err))

  emitAppReady()
  openDebugger()

  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
}).catch((err) => {
  log.withError(err).error('Error during app initialization')
})

app.on('window-all-closed', () => {
  emitAppWindowAllClosed()
  if (platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  emitAppBeforeQuit()
  injeca.stop()
  cleanupMicToggleShortcut()
})
