import type { BrowserWindow } from 'electron'

import { env } from 'node:process'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { app, ipcMain, shell } from 'electron'
import { isLinux, isMacOS, isWindows } from 'std-env'

import { electron, electronAppGetVersion, electronAppIsWayland, electronAppOpenUserDataFolder, electronAppQuit } from '../../../shared/eventa'
import { resolveIsWayland } from '../../app/ozone'

export function createAppService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  defineInvokeHandler(params.context, electron.app.isMacOS, () => isMacOS)
  defineInvokeHandler(params.context, electron.app.isWindows, () => isWindows)
  defineInvokeHandler(params.context, electron.app.isLinux, () => isLinux)
  defineInvokeHandler(params.context, electronAppIsWayland, () => resolveIsWayland({
    explicitOzonePlatform: app.commandLine.getSwitchValue('ozone-platform'),
    ozonePlatformHint: app.commandLine.getSwitchValue('ozone-platform-hint'),
    env,
  }))
  defineInvokeHandler(params.context, electronAppOpenUserDataFolder, async () => {
    const path = app.getPath('userData')
    const openResult = await shell.openPath(path)
    if (openResult) {
      throw new Error(openResult)
    }
    return { path }
  })
  defineInvokeHandler(params.context, electronAppQuit, () => app.quit())
}

/**
 * Serves the app version to the renderer of one window.
 *
 * The context hears only IPC from this window (`onlySameWindow`). A shared window context hears the IPC of all
 * windows, so one request runs the handler once for each open window. The adapter disposes the context, and with it
 * the handler, when the window closes.
 */
export function createAppVersionService(params: { window: BrowserWindow }) {
  const { context } = createContext(ipcMain, params.window, { onlySameWindow: true })
  defineInvokeHandler(context, electronAppGetVersion, () => app.getVersion())
}
