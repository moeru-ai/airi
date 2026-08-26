/**
 * Desktop Session — agent execution ownership model.
 *
 * Tracks what the agent is controlling, which windows it owns, and
 * the user's previous foreground context so it can be restored.
 *
 * The session is a lightweight state object managed by the RunStateManager.
 * It does not perform any OS actions itself — that's the job of
 * ChromeSessionManager and the executor.
 */

import type { ChromeSessionManager } from './chrome-session-manager'
import type { RunStateManager } from './state'
import type { ForegroundContext } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DesktopSession {
  /** App the agent is currently controlling. */
  controlledApp?: string
  /** ISO timestamp of session creation. */
  createdAt: string
  /** Session unique ID. */
  id: string
  /** ISO timestamp of last activity. */
  lastActiveAt: string
  /** Windows the agent owns or manages. */
  ownedWindows: OwnedWindow[]
  /** The user's foreground app before the agent took over. */
  userForegroundApp?: string
}

export interface DesktopSessionController {
  /**
   * Add an owned window to the session.
   */
  addOwnedWindow: (window: OwnedWindow) => void

  /**
   * Begin a new session targeting a specific app.
   * Records the user's current foreground and sets the agent's controlled app.
   */
  begin: (params: {
    controlledApp: string
    currentForeground?: ForegroundContext
  }) => DesktopSession

  /**
   * End the current session and clear session state.
   *
   * Foreground restoration is handled by the Chrome/session manager; this
   * controller only owns in-memory session bookkeeping.
   */
  end: () => void

  /**
   * Ensure the controlled app is in the foreground.
   * Delegates to ChromeSessionManager.bringToFront() for Chrome,
   * or to executor.focusApp() for other apps.
   *
   * Returns true if the app was already in front, false if it needed switching.
   */
  ensureControlledAppInForeground: (params: {
    activateApp: (appName: string) => Promise<void>
    chromeSessionManager: ChromeSessionManager
    currentForeground: ForegroundContext
  }) => Promise<boolean>

  /**
   * Get the current session (null if no session).
   */
  getSession: () => DesktopSession | null

  /**
   * Check if the session's controlled app is still in the foreground.
   */
  isControlledAppInForeground: (currentForeground: ForegroundContext) => boolean

  /**
   * Touch the session (update lastActiveAt).
   */
  touch: () => void
}

// ---------------------------------------------------------------------------
// Session Controller
// ---------------------------------------------------------------------------

export interface OwnedWindow {
  /** Whether the agent launched this app (vs. just taking a window in it). */
  agentLaunched: boolean
  /** Application name (e.g. "Google Chrome"). */
  appName: string
  /** Process ID. */
  pid: number
  /** Window identity string from observe-windows (ownerPid:layer:title). */
  windowId: string
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

let sessionCounter = 0

export function createDesktopSessionController(
  stateManager: RunStateManager,
): DesktopSessionController {
  let session: DesktopSession | null = null

  return {
    addOwnedWindow(window) {
      if (!session)
        return
      // Prevent duplicate entries
      if (session.ownedWindows.some(w => w.windowId === window.windowId))
        return
      session.ownedWindows.push(window)
      session.lastActiveAt = new Date().toISOString()
      stateManager.updateDesktopSession(session)
    },

    begin({ controlledApp, currentForeground }) {
      sessionCounter++
      session = {
        controlledApp,
        createdAt: new Date().toISOString(),
        id: `ds_${sessionCounter}`,
        lastActiveAt: new Date().toISOString(),
        ownedWindows: [],
        userForegroundApp: currentForeground?.appName !== controlledApp
          ? currentForeground?.appName
          : undefined,
      }

      stateManager.updateDesktopSession(session)

      // Also save the user's foreground for restore
      if (session.userForegroundApp) {
        stateManager.savePreviousUserForeground(session.userForegroundApp)
      }

      return session
    },

    end() {
      session = null
      stateManager.clearDesktopSession()
    },

    async ensureControlledAppInForeground({ activateApp, chromeSessionManager, currentForeground }) {
      if (!session?.controlledApp)
        return true

      if (this.isControlledAppInForeground(currentForeground)) {
        return true
      }

      // Save user's current foreground before switching
      if (currentForeground.appName && currentForeground.appName !== session.controlledApp) {
        session.userForegroundApp = currentForeground.appName
        stateManager.savePreviousUserForeground(currentForeground.appName)
      }

      // Switch to the controlled app
      if (session.controlledApp === 'Google Chrome') {
        const activated = await chromeSessionManager.bringToFront()
        if (!activated) {
          throw new Error('Controlled Chrome session is unavailable; call desktop_ensure_chrome before continuing.')
        }
      }
      else {
        await activateApp(session.controlledApp)
      }

      this.touch()
      return false
    },

    getSession() {
      return session
    },

    isControlledAppInForeground(currentForeground) {
      if (!session?.controlledApp)
        return false
      if (!currentForeground.available || !currentForeground.appName)
        return false
      return currentForeground.appName === session.controlledApp
    },

    touch() {
      if (!session)
        return
      session.lastActiveAt = new Date().toISOString()
      stateManager.updateDesktopSession(session)
    },
  }
}
