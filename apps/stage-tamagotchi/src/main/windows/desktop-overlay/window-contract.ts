import type { BrowserWindow, BrowserWindowConstructorOptions, Rectangle } from 'electron'

/**
 * Build BrowserWindow options for the desktop grounding overlay.
 *
 * Use when:
 * - Creating the transparent desktop overlay BrowserWindow
 * - Testing overlay input-isolation without starting Electron
 *
 * Expects:
 * - `bounds` are Electron screen logical coordinates for the display being covered
 * - `preloadPath` is an absolute path to the renderer preload script
 *
 * Returns:
 * - BrowserWindow options that keep the overlay visual-only and non-focusable
 */
export function createDesktopOverlayWindowOptions(params: {
  bounds: Rectangle
  preloadPath: string
}): BrowserWindowConstructorOptions {
  return {
    title: 'AIRI Desktop Overlay',
    width: params.bounds.width,
    height: params.bounds.height,
    x: params.bounds.x,
    y: params.bounds.y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: false,
    focusable: false,
    webPreferences: {
      preload: params.preloadPath,
      sandbox: false,
      backgroundThrottling: false,
    },
  }
}

/**
 * Apply input-isolation flags to the desktop grounding overlay.
 *
 * Use when:
 * - The overlay window has been created and must become click-through
 * - The overlay should render above apps without stealing mouse or focus
 *
 * Expects:
 * - The window is the dedicated desktop overlay window
 *
 * Returns:
 * - Nothing; mutates Electron window flags in place
 */
export function applyDesktopOverlayInputIsolation(
  window: Pick<BrowserWindow, 'setAlwaysOnTop' | 'setContentProtection' | 'setIgnoreMouseEvents' | 'setVisibleOnAllWorkspaces'>,
): void {
  window.setIgnoreMouseEvents(true, { forward: true })
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setContentProtection(true)
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
}

/**
 * Show the overlay without activating or focusing it.
 *
 * Use when:
 * - The overlay renderer is ready and should become visible
 * - User focus must remain on the controlled application
 *
 * Expects:
 * - The BrowserWindow supports Electron's `showInactive()`
 *
 * Returns:
 * - Nothing; shows the window without stealing focus
 */
export function showDesktopOverlayWithoutFocus(
  window: Pick<BrowserWindow, 'showInactive'>,
): void {
  window.showInactive()
}
