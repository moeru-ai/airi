import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'

import { join, resolve } from 'node:path'

import { BrowserWindow } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager/reusable'
import { currentDisplayBounds, mapForBreakpoints, resolutionBreakpoints, widthFrom } from '../shared/display'
import { protectPrivilegedWindowNavigation, spotlightLikeWindowConfig, transparentWindowConfig } from '../shared/window'
import { setupInlayWindowInvokes } from './rpc/index.electron'

export { setupVoiceIndicatorWindowReusable } from './indicator'

export function setupInlayWindowReusable(params: {
  serverChannel: ServerChannel
  i18n: I18n
  indicatorWindow: () => Promise<BrowserWindow>
}) {
  return createReusableWindow(async () => {
    const window = new BrowserWindow({
      title: 'Inlay',
      width: 450,
      height: 140,
      show: false,
      icon,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
      ...spotlightLikeWindowConfig(),
      ...transparentWindowConfig(),
    })

    if (isMacOS) {
      window.setWindowButtonVisibility(false)
    }

    const displayBounds = currentDisplayBounds(window)
    const width = mapForBreakpoints(
      displayBounds.width,
      {
        '720p': widthFrom(displayBounds, { percentage: 1, max: { percentage: 0.5 } }),
        '1080p': widthFrom(displayBounds, { percentage: 1, max: { percentage: 0.33 } }),
        '2k': widthFrom(displayBounds, { percentage: 0.25, max: { actual: 710 } }),
        '4k': widthFrom(displayBounds, { percentage: 0.2, max: { actual: 768 } }),
      },
      { breakpoints: resolutionBreakpoints },
    )
    const height = 140

    window.setBounds({
      width,
      height,
      x: displayBounds.x + (displayBounds.width - width) / 2, // Center horizontally
      y: mapForBreakpoints(
        displayBounds.height,
        {
          sm: displayBounds.height / 4 * 3 - height, // Bottom quarter, minus window height
          md: displayBounds.height / 5 * 4 - height, // Center vertically
          lg: displayBounds.height / 6 * 5 - height, // Top quarter, minus half window height
        },
      ),
    })

    protectPrivilegedWindowNavigation(window)

    await setupInlayWindowInvokes({ inlayWindow: window, indicatorWindow: params.indicatorWindow, serverChannel: params.serverChannel, i18n: params.i18n })

    await load(window, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/inlay', {
      query: { 'synced-leader': 'false' },
    }))

    return window
  }).getWindow
}
