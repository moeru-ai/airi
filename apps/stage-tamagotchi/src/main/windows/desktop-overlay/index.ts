/**
 * Desktop Grounding Overlay — transparent always-on-top window
 *
 * Renders:
 * - Ghost pointer dot at the snap-resolved click position
 * - Bounding box around the matched target candidate
 * - Source label + confidence badge
 * - Stale flags
 *
 * Gated by AIRI_DESKTOP_OVERLAY=1 environment variable.
 * When disabled, this module is a no-op.
 *
 * Data flow (v1):
 * - The overlay renderer polls `computer_use::desktop_get_state` via the MCP bridge
 * - No IPC push from main process to renderer
 * - No Eventa channels or server push
 *
 * The overlay is click-through (setIgnoreMouseEvents) so it never
 * intercepts real user or OS-level click events.
 */

import { join, resolve } from 'node:path'

import { BrowserWindow, screen } from 'electron'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'

/** Whether the desktop overlay feature is enabled */
export function isDesktopOverlayEnabled(): boolean {
  return process.env.AIRI_DESKTOP_OVERLAY === '1'
}

let overlayWindow: BrowserWindow | null = null

/**
 * Create the transparent overlay window covering the full primary display.
 * The window is:
 * - Always on top (screen level)
 * - Click-through (ignoreMouseEvents)
 * - Transparent and frameless
 * - Not shown in taskbar / dock
 *
 * Returns null if AIRI_DESKTOP_OVERLAY is not set.
 */
export async function setupDesktopOverlayWindow(): Promise<BrowserWindow | null> {
  if (!isDesktopOverlayEnabled()) {
    return null
  }

  // Use primary display dimensions for full-screen coverage
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.size

  overlayWindow = new BrowserWindow({
    title: 'AIRI Desktop Overlay',
    width,
    height,
    x: 0,
    y: 0,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    // Round corners off for pixel-accurate overlay
    roundedCorners: false,
    // Prevent the overlay from stealing focus
    focusable: false,
    webPreferences: {
      preload: join(getElectronMainDirname(), '../preload/index.mjs'),
      sandbox: false,
      // Disable background throttling so animations stay smooth
      backgroundThrottling: false,
    },
  })

  // Make click-through: all mouse events pass through to the desktop
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  // Set to screen level (above all other windows)
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')

  // Prevent the window from appearing in screenshots/recordings if possible
  overlayWindow.setContentProtection(true)

  // Hide from Mission Control / Exposé on macOS
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  overlayWindow.on('ready-to-show', () => {
    overlayWindow?.show()
  })

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  // Load the overlay renderer page
  await load(
    overlayWindow,
    withHashRoute(
      baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')),
      '/desktop-overlay',
    ),
  )

  return overlayWindow
}

/**
 * Get the current overlay window instance (if active).
 */
export function getDesktopOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

/**
 * Tear down the overlay window.
 */
export function destroyDesktopOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
    overlayWindow = null
  }
}
