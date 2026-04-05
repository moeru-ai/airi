import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { GodotStageManager } from '../../../services/airi/godot-stage'
import type { IOTraceRecordingService } from '../../../services/airi/io-trace-recording'
import type { McpManager } from '../../../services/airi/mcp-servers'
import type { AutoUpdater } from '../../../services/electron/auto-updater'
import type { GlobalShortcutService } from '../../../services/electron/global-shortcut'
import type { DevtoolsWindowManager } from '../../devtools'
import type { EditorWindowManager } from '../../editor'
import type { SpotlightWindowManager } from '../../spotlight'
import type { WidgetsWindowManager } from '../../widgets'

import { defineInvokeHandler } from '@moeru/eventa'
import { ipcMain } from 'electron'

import {
  electronCenterMainWindow,
  electronOpenDevtoolsWindow,
  electronOpenEditor,
  electronOpenSettingsDevtools,
  electronSpotlightShortcutGet,
  electronSpotlightShortcutSet,
} from '../../../../shared/eventa'
import { createWindowContext } from '../../../libs/electron/window-context'
import { createAuthService } from '../../../services/airi/auth'
import { createGodotStageService } from '../../../services/airi/godot-stage'
import { registerIOTraceRecording } from '../../../services/airi/io-trace-recording/register'
import { createMcpServersService } from '../../../services/airi/mcp-servers'
import { createWidgetsService } from '../../../services/airi/widgets'
import { createAutoUpdaterService } from '../../../services/electron'
import { centerWindowOnDisplay } from '../../shared/display'
import { setupBaseWindowElectronInvokes } from '../../shared/window'

/**
 * Registers what the settings pages ask of the window that shows them: the Spotlight shortcut and the devtools. Each
 * window registers the global shortcuts itself, because the main window needs them for Push to Talk too.
 *
 * Use when:
 * - A window shows settings pages, such as the settings window or the main window in its fullscreen mode.
 */
export function setupSettingsPageInvokes(params: {
  context: ReturnType<typeof createContext>['context']
  window: BrowserWindow
  spotlightWindow: SpotlightWindowManager
  devtoolsWindow: DevtoolsWindowManager
}) {
  const { context, window } = params
  defineInvokeHandler(context, electronSpotlightShortcutGet, () => params.spotlightWindow.getShortcutAccelerator())
  defineInvokeHandler(context, electronSpotlightShortcutSet, (payload) => {
    if (payload?.accelerator === undefined)
      throw new TypeError('electronSpotlightShortcutSet called with invalid payload')

    return params.spotlightWindow.updateShortcutAccelerator(payload.accelerator)
  })
  defineInvokeHandler(context, electronOpenSettingsDevtools, async () => window.webContents.openDevTools({ mode: 'detach' }))
  defineInvokeHandler(context, electronOpenDevtoolsWindow, async (payload) => {
    await params.devtoolsWindow.openWindow(payload)
  })
}

export async function setupSettingsWindowInvokes(params: {
  settingsWindow: BrowserWindow
  widgetsManager: WidgetsWindowManager
  autoUpdater: AutoUpdater
  devtoolsWindow: DevtoolsWindowManager
  editorWindow: EditorWindowManager
  getMainWindow?: () => BrowserWindow | undefined
  serverChannel: ServerChannel
  godotStageManager: GodotStageManager
  mcpManager: McpManager
  i18n: I18n
  globalShortcut: GlobalShortcutService
  spotlightWindow: SpotlightWindowManager
  ioTraceRecording: IOTraceRecordingService
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createWindowContext(params.settingsWindow)

  await setupBaseWindowElectronInvokes({ context, window: params.settingsWindow, i18n: params.i18n, serverChannel: params.serverChannel })

  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.settingsWindow })
  createAutoUpdaterService({ context, window: params.settingsWindow, service: params.autoUpdater })
  createMcpServersService({ context, manager: params.mcpManager })
  createGodotStageService({ context, manager: params.godotStageManager, window: params.settingsWindow })
  createAuthService({ context, window: params.settingsWindow })
  const stopIOTraceRecording = registerIOTraceRecording(context, params.ioTraceRecording)
  params.settingsWindow.once('closed', stopIOTraceRecording)

  // Register the global shortcut service for the settings window.
  params.globalShortcut.registerWindow({ context, window: params.settingsWindow })
  setupSettingsPageInvokes({
    context,
    window: params.settingsWindow,
    spotlightWindow: params.spotlightWindow,
    devtoolsWindow: params.devtoolsWindow,
  })
  defineInvokeHandler(context, electronCenterMainWindow, () => centerWindowOnDisplay(params.getMainWindow?.()))
  defineInvokeHandler(context, electronOpenEditor, () => params.editorWindow.openWindow())

  return context
}
