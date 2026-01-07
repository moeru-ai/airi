import { join, resolve } from 'node:path'

import { BrowserWindow, shell } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { currentDisplayBounds, mapForBreakpoints, resolutionBreakpoints, widthFrom } from '../shared/display'
import { spotlightLikeWindowConfig } from '../shared/window'
import { setupInlayWindowInvokes } from './rpc/index.electron'

export async function setupInlayWindow() {
  const window = new BrowserWindow({
    title: 'Inlay',
    width: 450,
    height: 150,
    show: false,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
    ...spotlightLikeWindowConfig(),
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
  const height = width / 4

  window.setBounds({
    width,
    height: width / 4,
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

  window.on('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  await load(window, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/inlay'))

  setupInlayWindowInvokes({ inlayWindow: window })

  return window
}
