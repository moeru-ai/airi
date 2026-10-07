import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'

import { join, resolve } from 'node:path'

import { BrowserWindow, screen } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager/reusable'
import { protectPrivilegedWindowNavigation, spotlightLikeWindowConfig, transparentWindowConfig } from '../shared/window'
import { INLAY_WINDOW_HEIGHT, inlayWindowBounds } from './bounds'
import { setupInlayWindowInvokes } from './rpc/index.electron'

export function setupInlayWindowReusable(params: {
  serverChannel: ServerChannel
  i18n: I18n
}) {
  return createReusableWindow(async () => {
    const window = new BrowserWindow({
      ...transparentWindowConfig(),
      ...spotlightLikeWindowConfig(),
      // transparentWindowConfig removes the shadow. The inlay is a native vibrancy panel, so it keeps the system shadow.
      hasShadow: true,
      title: 'Inlay',
      width: 450,
      height: INLAY_WINDOW_HEIGHT,
      show: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      skipTaskbar: true,
      icon,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
    })

    if (isMacOS) {
      window.setWindowButtonVisibility(false)
      window.setHiddenInMissionControl(true)
    }

    // Only a new window gets the default position. Hiding keeps the window, so a dragged position lasts until the app quits.
    window.setBounds(inlayWindowBounds(screen.getDisplayMatching(window.getBounds()).workArea))

    protectPrivilegedWindowNavigation(window)

    await setupInlayWindowInvokes({ inlayWindow: window, serverChannel: params.serverChannel, i18n: params.i18n })

    await load(window, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/inlay', {
      query: { 'stage-runtime': 'minimal', 'synced-leader': 'false' },
    }))

    return window
  }).getWindow
}
