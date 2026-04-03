import type { I18n } from '../../libs/i18n'
import type { WindowAuthManager } from '../../services/airi/auth'
import type { ServerChannel } from '../../services/airi/channel-server'

import { join, resolve } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { safeClose } from '@proj-airi/electron-vueuse/main'
import { BrowserWindow, ipcMain, shell } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { electronOnboardingClose } from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { createAuthService } from '../../services/airi/auth'
import { toggleWindowShow } from '../shared'
import { setupBaseWindowElectronInvokes } from '../shared/window'

export interface OnboardingWindowManager {
  getWindow: () => Promise<BrowserWindow>
  getAndToggleWindow: () => Promise<BrowserWindow>
}

export function setupOnboardingWindowManager(params: {
  serverChannel: ServerChannel
  i18n: I18n
  windowAuthManager: WindowAuthManager
}): OnboardingWindowManager {
  async function getOnboardingWindow(getWindow: () => Promise<BrowserWindow>) {
    const window = await getWindow()
    await toggleWindowShow(window)

    return window
  }

  const reusableWindow = createReusableWindow(async () => {
    const newWindow = new BrowserWindow({
      title: 'Welcome to AIRI',
      width: 1000,
      height: 650,
      minWidth: 400,
      minHeight: 500,
      show: false,
      icon,
      resizable: true,
      frame: !isMacOS,
      titleBarStyle: isMacOS ? 'hidden' : undefined,
      transparent: false,
      backgroundColor: '#0f0f0f',
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
    })

    newWindow.on('ready-to-show', () => newWindow.show())
    newWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // TODO: once we refactored eventa to support window-namespaced contexts,
    // we can remove the setMaxListeners call below since eventa will be able to dispatch and
    // manage events within eventa's context system.
    ipcMain.setMaxListeners(0)

    const { context } = createContext(ipcMain, newWindow)

    defineInvokeHandler(context, electronOnboardingClose, async () => {
      safeClose(newWindow)
    })

    await setupBaseWindowElectronInvokes({ context, window: newWindow, i18n: params.i18n, serverChannel: params.serverChannel })
    createAuthService({ context, window: newWindow, windowAuthManager: params.windowAuthManager })

    await load(newWindow, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/onboarding'))

    return newWindow
  })

  return {
    getWindow: async () => reusableWindow.getWindow(),
    getAndToggleWindow: async () => await getOnboardingWindow(reusableWindow.getWindow),
  }
}
