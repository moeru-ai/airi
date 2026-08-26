import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'

import { join, resolve } from 'node:path'

import { BrowserWindow } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { currentDisplayBounds, mapForBreakpoints, resolutionBreakpoints, widthFrom } from '../shared/display'
import { protectPrivilegedWindowNavigation, spotlightLikeWindowConfig } from '../shared/window'
import { setupInlayWindowInvokes } from './rpc/index.electron'

export async function setupInlayWindow(params: {
  i18n: I18n
  serverChannel: ServerChannel
}) {
  const window = new BrowserWindow({
    height: 150,
    icon,
    show: false,
    title: 'Inlay',
    webPreferences: {
      preload: join(getElectronMainDirname(), '../preload/index.mjs'),
      sandbox: false,
    },
    width: 450,
    ...spotlightLikeWindowConfig(),
  })

  if (isMacOS) {
    window.setWindowButtonVisibility(false)
  }

  const displayBounds = currentDisplayBounds(window)
  const width = mapForBreakpoints(
    displayBounds.width,
    {
      '2k': widthFrom(displayBounds, { max: { actual: 710 }, percentage: 0.25 }),
      '4k': widthFrom(displayBounds, { max: { actual: 768 }, percentage: 0.2 }),
      '720p': widthFrom(displayBounds, { max: { percentage: 0.5 }, percentage: 1 }),
      '1080p': widthFrom(displayBounds, { max: { percentage: 0.33 }, percentage: 1 }),
    },
    { breakpoints: resolutionBreakpoints },
  )
  const height = width / 4

  window.setBounds({
    height: width / 4,
    width,
    x: displayBounds.x + (displayBounds.width - width) / 2, // Center horizontally
    y: mapForBreakpoints(
      displayBounds.height,
      {
        lg: displayBounds.height / 6 * 5 - height, // Top quarter, minus half window height
        md: displayBounds.height / 5 * 4 - height, // Center vertically
        sm: displayBounds.height / 4 * 3 - height, // Bottom quarter, minus window height
      },
    ),
  })

  window.on('ready-to-show', () => window.show())
  protectPrivilegedWindowNavigation(window)

  await setupInlayWindowInvokes({ i18n: params.i18n, inlayWindow: window, serverChannel: params.serverChannel })

  await load(window, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/inlay', {
    query: { 'synced-leader': 'false' },
  }))

  return window
}
