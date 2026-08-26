import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'

import { join, resolve } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { safeClose } from '@proj-airi/electron-vueuse/main'
import { BrowserWindow, ipcMain } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { electronOnboardingClose } from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { createAuthService } from '../../services/airi/auth'
import { protectPrivilegedWindowNavigation, toggleWindowShow } from '../shared'
import { setupBaseWindowElectronInvokes } from '../shared/window'

export interface OnboardingWindowManager {
  getAndToggleWindow: () => Promise<BrowserWindow>
  getWindow: () => Promise<BrowserWindow>
  onClosed: (callback: () => void) => () => void
}

export function setupOnboardingWindowManager(params: {
  i18n: I18n
  serverChannel: ServerChannel
}): OnboardingWindowManager {
  const closeCallbacks = new Set<() => void>()

  async function getOnboardingWindow(getWindow: () => Promise<BrowserWindow>) {
    const window = await getWindow()
    await toggleWindowShow(window)

    return window
  }

  const reusableWindow = createReusableWindow(async () => {
    const newWindow = new BrowserWindow({
      backgroundColor: '#0f0f0f',
      frame: !isMacOS,
      height: 650,
      icon,
      minHeight: 500,
      minWidth: 400,
      resizable: true,
      show: false,
      title: 'Welcome to AIRI',
      titleBarStyle: isMacOS ? 'hidden' : undefined,
      transparent: false,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
      width: 1000,
    })

    newWindow.on('ready-to-show', () => newWindow.show())
    protectPrivilegedWindowNavigation(newWindow)

    // TODO: once we refactored eventa to support window-namespaced contexts,
    // we can remove the setMaxListeners call below since eventa will be able to dispatch and
    // manage events within eventa's context system.
    ipcMain.setMaxListeners(0)

    const { context } = createContext(ipcMain, newWindow)

    defineInvokeHandler(context, electronOnboardingClose, async () => {
      safeClose(newWindow)
    })

    await setupBaseWindowElectronInvokes({ context, i18n: params.i18n, serverChannel: params.serverChannel, window: newWindow })
    createAuthService({ context, window: newWindow })

    await load(newWindow, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/onboarding', {
      query: { 'synced-leader': 'false' },
    }))

    newWindow.on('closed', () => {
      for (const cb of closeCallbacks) {
        try {
          cb()
        }
        catch { /* noop */ }
      }
    })

    return newWindow
  })

  return {
    getAndToggleWindow: async () => await getOnboardingWindow(reusableWindow.getWindow),
    getWindow: async () => reusableWindow.getWindow(),
    onClosed: (callback: () => void) => {
      closeCallbacks.add(callback)
      return () => {
        closeCallbacks.delete(callback)
      }
    },
  }
}
