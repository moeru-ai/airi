import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'

import type { ResizeDirection } from '../../../shared/electron/window'

import { isMacOS } from 'std-env'

export function toggleWindowShow(window?: BrowserWindow | null): void {
  if (!window) {
    return
  }
  if (window.isDestroyed()) {
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
