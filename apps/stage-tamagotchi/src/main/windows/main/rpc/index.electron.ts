import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { GodotStageManager } from '../../../services/airi/godot-stage'
import type { IOTraceRecordingService } from '../../../services/airi/io-trace-recording'
import type { McpManager } from '../../../services/airi/mcp-servers'
import type { AutoUpdater } from '../../../services/electron/auto-updater'
import type { GlobalShortcutService } from '../../../services/electron/global-shortcut'
import type { ChatWindowManager } from '../../chat'
import type { EditorWindowManager } from '../../editor'
import type { NoticeWindowManager } from '../../notice'
import type { OnboardingWindowManager } from '../../onboarding'
import type { SettingsWindowManager } from '../../settings'
import type { WidgetsWindowManager } from '../../widgets'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import {
  electronCenterMainWindow,
  electronChatButtonStateChanged,
  electronGetChatButtonState,
  electronOpenChat,
  electronOpenEditor,
  electronOpenInlay,
  electronOpenMainDevtools,
  electronOpenSettings,
  noticeWindowEventa,
} from '../../../../shared/eventa'
import { createAuthService } from '../../../services/airi/auth'
import { createGodotStageService } from '../../../services/airi/godot-stage'
import { registerIOTraceRecording } from '../../../services/airi/io-trace-recording/register'
import { createMcpServersService } from '../../../services/airi/mcp-servers'
import { createOnboardingService } from '../../../services/airi/onboarding'
import { createWidgetsService } from '../../../services/airi/widgets'
import { createAutoUpdaterService } from '../../../services/electron'
import { centerWindowOnDisplay } from '../../shared/display'
import { setupBaseWindowElectronInvokes } from '../../shared/window'

export async function setupMainWindowElectronInvokes(params: {
  window: BrowserWindow
  editorWindow: EditorWindowManager
  settingsWindow: SettingsWindowManager
  chatWindow: ChatWindowManager
  widgetsManager: WidgetsWindowManager
  noticeWindow: NoticeWindowManager
  autoUpdater: AutoUpdater
  serverChannel: ServerChannel
  godotStageManager: GodotStageManager
  mcpManager: McpManager
  i18n: I18n
  onboardingWindowManager: OnboardingWindowManager
  ioTraceRecording: IOTraceRecordingService
  inlayWindow: () => Promise<BrowserWindow>
  globalShortcut: GlobalShortcutService
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.window)

  await setupBaseWindowElectronInvokes({ context, window: params.window, serverChannel: params.serverChannel, i18n: params.i18n })
  // The stage renderer owns the voice host, so it registers the Push to Talk hold shortcut and receives its key events.
  params.globalShortcut.registerWindow({ context, window: params.window })
  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.window })
  createAutoUpdaterService({ context, window: params.window, service: params.autoUpdater })
  createMcpServersService({ context, manager: params.mcpManager })
  createGodotStageService({ context, manager: params.godotStageManager, window: params.window })
  createOnboardingService({ context, onboardingWindowManager: params.onboardingWindowManager, mainWindow: params.window })
  createAuthService({ context, window: params.window })
  const stopIOTraceRecording = registerIOTraceRecording(context, params.ioTraceRecording)
  params.window.once('closed', stopIOTraceRecording)

  defineInvokeHandler(context, electronCenterMainWindow, () => centerWindowOnDisplay(params.window))
  defineInvokeHandler(context, electronOpenMainDevtools, () => params.window.webContents.openDevTools({ mode: 'detach' }))
  defineInvokeHandler(context, electronOpenEditor, () => params.editorWindow.openWindow())
  // Speech opens the inlay without focus, so the user can keep working in another app while speaking.
  defineInvokeHandler(context, electronOpenInlay, async () => {
    const inlay = await params.inlayWindow()
    if (!inlay.isDestroyed() && !inlay.isVisible())
      inlay.showInactive()
  })
  defineInvokeHandler(context, electronOpenSettings, payload => params.settingsWindow.openWindow(payload?.route))
  defineInvokeHandler(context, electronOpenChat, () => params.chatWindow.toggle())
  defineInvokeHandler(context, electronGetChatButtonState, () => params.chatWindow.getButtonState())
  const stopChatButtonState = params.chatWindow.onButtonStateChange(state => context.emit(electronChatButtonStateChanged, state))
  params.window.once('closed', stopChatButtonState)
  defineInvokeHandler(context, noticeWindowEventa.openWindow, payload => params.noticeWindow.open(payload))
}
