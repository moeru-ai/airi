import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { ResizeDirection } from '@proj-airi/electron-eventa'
import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'

import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'

import { isRendererUnavailable } from '@proj-airi/electron-vueuse/main'
import { isMacOS } from 'std-env'

import { createServerChannelService } from '../../services/airi/channel-server'
import { createI18nService } from '../../services/airi/i18n'
import { createAppService, createPowerMonitorService, createScreenService, createWindowService } from '../../services/electron'

export function toggleWindowShow(window?: BrowserWindow | null): void {
  if (!window) {
    return
  }
  if (isRendererUnavailable(window)) {
    return
  }

  if (window?.isMinimized()) {
    window?.restore()
  }

  window?.show()
  window?.focus()
}

export function transparentWindowConfig(): BrowserWindowConstructorOptions {
  return {
    frame: false,
    titleBarStyle: isMacOS ? 'hidden' : undefined,
    transparent: true,
    hasShadow: false,
  }
}

export function blurryWindowConfig(): BrowserWindowConstructorOptions {
  return {
    vibrancy: 'hud',
    backgroundMaterial: 'acrylic',
  }
}

export function spotlightLikeWindowConfig(): BrowserWindowConstructorOptions {
  return {
    ...blurryWindowConfig(),
    titleBarStyle: isMacOS ? 'hidden' : undefined,
  }
}

export function resizeWindowByDelta(params: {
  window: BrowserWindow
  deltaX: number
  deltaY: number
  direction: ResizeDirection
  minWidth?: number
  minHeight?: number
}): void {
  const bounds = params.window.getBounds()
  const minWidth = params.minWidth ?? 100
  const minHeight = params.minHeight ?? 200

  let { x, y, width, height } = bounds

  if (params.direction.includes('e')) {
    width = Math.max(minWidth, width + params.deltaX)
  }
  if (params.direction.includes('w')) {
    const newWidth = Math.max(minWidth, width - params.deltaX)
    if (newWidth !== width) {
      x = x + (width - newWidth)
      width = newWidth
    }
  }

  if (params.direction.includes('s')) {
    height = Math.max(minHeight, height + params.deltaY)
  }
  if (params.direction.includes('n')) {
    const newHeight = Math.max(minHeight, height - params.deltaY)
    if (newHeight !== height) {
      y = y + (height - newHeight)
      height = newHeight
    }
  }

  params.window.setBounds({ x, y, width, height })
}

export async function setupBaseWindowElectronInvokes(params: {
  context: ReturnType<typeof createContext>['context']
  window: BrowserWindow
  serverChannel: ServerChannel
  i18n: I18n
}) {
  createScreenService({ context: params.context, window: params.window })
  createWindowService({ context: params.context, window: params.window })
  createAppService({ context: params.context, window: params.window })
  createPowerMonitorService({ context: params.context, window: params.window })

  await createI18nService({ context: params.context, window: params.window, i18n: params.i18n })

  createServerChannelService({ serverChannel: params.serverChannel })
}
