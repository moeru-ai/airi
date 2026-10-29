import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'

import { defineInvokeHandler } from '@moeru/eventa'
import { safeClose } from '@proj-airi/electron-vueuse/main'
import { BrowserWindow, ipcMain } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { electronOnboardingClose } from '../../../shared/eventa'
import { showWindow } from '../../libs/electron/focus'
import { baseUrl, getPreloadPath, getRendererRoot, load, withHashRoute } from '../../libs/electron/location'
import { createWindowContext } from '../../libs/electron/window-context'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { createAuthService } from '../../services/airi/auth'
import { protectPrivilegedWindowNavigation, toggleWindowShow } from '../shared'
import { setupBaseWindowElectronInvokes } from '../shared/window'

export interface OnboardingWindowManager {
  getWindow: () => Promise<BrowserWindow>
  getAndToggleWindow: () => Promise<BrowserWindow>
  onClosed: (callback: () => void) => () => void
}

export function setupOnboardingWindowManager(params: {
  serverChannel: ServerChannel
  i18n: I18n
}): OnboardingWindowManager {
  const closeCallbacks = new Set<() => void>()

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
        preload: getPreloadPath(),
        sandbox: false,
      },
    })

    newWindow.on('ready-to-show', () => showWindow(newWindow))
    protectPrivilegedWindowNavigation(newWindow)

    // TODO: once we refactored eventa to support window-namespaced contexts,
    // we can remove the setMaxListeners call below since eventa will be able to dispatch and
    // manage events within eventa's context system.
    ipcMain.setMaxListeners(0)

    const { context } = createWindowContext(newWindow)

    defineInvokeHandler(context, electronOnboardingClose, async () => {
      safeClose(newWindow)
    })

    await setupBaseWindowElectronInvokes({ context, window: newWindow, i18n: params.i18n, serverChannel: params.serverChannel })
    createAuthService({ context, window: newWindow })

    await load(newWindow, withHashRoute(baseUrl(getRendererRoot()), '/onboarding', {
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
    getWindow: async () => reusableWindow.getWindow(),
    getAndToggleWindow: async () => await getOnboardingWindow(reusableWindow.getWindow),
    onClosed: (callback: () => void) => {
      closeCallbacks.add(callback)
      return () => {
        closeCallbacks.delete(callback)
      }
    },
  }
}
