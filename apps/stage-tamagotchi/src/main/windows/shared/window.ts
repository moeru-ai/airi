import { BrowserWindow, type BrowserWindowConstructorOptions, ipcMain } from 'electron'

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

export function setupManualResize(window: BrowserWindow): void {
  ipcMain.handle('window:resize', (event, deltaX: number, deltaY: number, direction: string) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    if (senderWindow !== window) {
      return
    }

    const bounds = window.getBounds()
    const minWidth = 100
    const minHeight = 200

    let { x, y, width, height } = bounds

    // Handle horizontal resize
    if (direction.includes('e')) {
      width = Math.max(minWidth, width + deltaX)
    }
    if (direction.includes('w')) {
      const newWidth = Math.max(minWidth, width - deltaX)
      if (newWidth !== width) {
        x = x + (width - newWidth)
        width = newWidth
      }
    }

    // Handle vertical resize
    if (direction.includes('s')) {
      height = Math.max(minHeight, height + deltaY)
    }
    if (direction.includes('n')) {
      const newHeight = Math.max(minHeight, height - deltaY)
      if (newHeight !== height) {
        y = y + (height - newHeight)
        height = newHeight
      }
    }

    window.setBounds({ x, y, width, height })
  })

  window.on('closed', () => {
    ipcMain.removeHandler('window:resize')
  })
}
