import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'

import { join, resolve } from 'node:path'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { BrowserWindow, ipcMain } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager/reusable'
import { protectPrivilegedWindowNavigation, setupBaseWindowElectronInvokes, transparentWindowConfig } from '../shared/window'

/** Creates the transparent, non-interactive window used only while listening. */
export function setupVoiceIndicatorWindowReusable(params: {
  serverChannel: ServerChannel
  i18n: I18n
}) {
  return createReusableWindow(async () => {
    const window = new BrowserWindow({
      title: params.i18n.t('tamagotchi.stage.voice-inlay.indicator-title'),
      width: 280,
      height: 56,
      show: false,
      focusable: false,
      skipTaskbar: true,
      icon,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
      ...transparentWindowConfig(),
    })

    if (isMacOS)
      window.setWindowButtonVisibility(false)

    window.setIgnoreMouseEvents(true)
    protectPrivilegedWindowNavigation(window)

    const { context } = createContext(ipcMain, window)
    await setupBaseWindowElectronInvokes({
      context,
      window,
      serverChannel: params.serverChannel,
      i18n: params.i18n,
    })

    await load(window, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/inlay/indicator', {
      query: { 'synced-leader': 'false', 'stage-runtime': 'minimal' },
    }))

    return window
  }).getWindow
}
