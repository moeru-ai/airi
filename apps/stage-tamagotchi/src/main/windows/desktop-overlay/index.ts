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

import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { McpStdioManager } from '../../services/airi/mcp-servers'

import { join, resolve } from 'node:path'

import { BrowserWindow, screen } from 'electron'

import { desktopOverlayPollHeartbeatMarker, desktopOverlayPollHeartbeatQueryParam } from '../../../shared/desktop-overlay-heartbeat'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { setupDesktopOverlayElectronInvokes } from './rpc/index.electron'
import {
  applyDesktopOverlayInputIsolation,
  createDesktopOverlayWindowOptions,
  showDesktopOverlayWithoutFocus,
} from './window-contract'

/** Whether the desktop overlay feature is enabled */
export function isDesktopOverlayEnabled(): boolean {
  return process.env.AIRI_DESKTOP_OVERLAY === '1'
}

/**
 * Smoke-only overlay heartbeat mode.
 * The recut desktop smoke uses this to surface renderer console lines and
 * mount the in-page smoke bridge.
 */
export function isDesktopOverlayPollHeartbeatEnabled(): boolean {
  return process.env.AIRI_DESKTOP_OVERLAY_POLL_HEARTBEAT === '1'
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
export async function setupDesktopOverlayWindow(params: {
  mcpStdioManager: McpStdioManager
  serverChannel: ServerChannel
  i18n: I18n
}): Promise<BrowserWindow | null> {
  if (!isDesktopOverlayEnabled()) {
    return null
  }

  // Use primary display bounds (not just size) — the origin may be non-zero
  // when multiple displays are arranged in macOS Display Preferences.
  const primaryDisplay = screen.getPrimaryDisplay()
  const preloadPath = join(getElectronMainDirname(), '../preload/index.mjs')

  overlayWindow = new BrowserWindow(createDesktopOverlayWindowOptions({
    bounds: primaryDisplay.bounds,
    preloadPath,
  }))
  applyDesktopOverlayInputIsolation(overlayWindow)

  overlayWindow.on('ready-to-show', () => {
    if (overlayWindow)
      showDesktopOverlayWithoutFocus(overlayWindow)
  })

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  if (isDesktopOverlayPollHeartbeatEnabled()) {
    overlayWindow.webContents.on('console-message', (_event, _level, message) => {
      if (message.includes(desktopOverlayPollHeartbeatMarker)) {
        console.info(message)
      }
    })
  }

  // NOTICE: Wire eventa RPC BEFORE loading the renderer page.
  // The overlay's onMounted fires during load() and immediately starts
  // polling via callTool. If the handlers aren't registered yet, the
  // first eventa invoke hangs forever (no response dispatched back to
  // this window), and all subsequent poll cycles never fire because
  // the poll loop awaits each call sequentially.
  await setupDesktopOverlayElectronInvokes({
    window: overlayWindow,
    mcpStdioManager: params.mcpStdioManager,
    serverChannel: params.serverChannel,
    i18n: params.i18n,
  })

  // Load the overlay renderer page
  await load(
    overlayWindow,
    withHashRoute(
      baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')),
      isDesktopOverlayPollHeartbeatEnabled()
        ? `/desktop-overlay?${desktopOverlayPollHeartbeatQueryParam}=1`
        : '/desktop-overlay',
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
