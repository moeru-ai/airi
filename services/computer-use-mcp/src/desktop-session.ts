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

export interface OwnedWindow {
  /** Application name (e.g. "Google Chrome"). */
  appName: string
  /** Window identity string from observe-windows (ownerPid:layer:title). */
  windowId: string
  /** Process ID. */
  pid: number
  /** Whether the agent launched this app (vs. just taking a window in it). */
  agentLaunched: boolean
}

export interface DesktopSession {
  /** Session unique ID. */
  id: string
  /** App the agent is currently controlling. */
  controlledApp?: string
  /** Windows the agent owns or manages. */
  ownedWindows: OwnedWindow[]
  /** The user's foreground app before the agent took over. */
  userForegroundApp?: string
  /** ISO timestamp of session creation. */
  createdAt: string
  /** ISO timestamp of last activity. */
  lastActiveAt: string
}

// ---------------------------------------------------------------------------
// Session Controller
// ---------------------------------------------------------------------------

export interface DesktopSessionController {
  /**
   * Begin a new session targeting a specific app.
   * Records the user's current foreground and sets the agent's controlled app.
   */
  begin: (params: {
    controlledApp: string
    currentForeground?: ForegroundContext
  }) => DesktopSession

  /**
   * End the current session. Optionally restores the user's previous foreground.
   */
  end: () => void

  /**
   * Add an owned window to the session.
   */
  addOwnedWindow: (window: OwnedWindow) => void

  /**
   * Touch the session (update lastActiveAt).
   */
  touch: () => void

  /**
   * Get the current session (null if no session).
   */
  getSession: () => DesktopSession | null

  /**
   * Check if the session's controlled app is still in the foreground.
   */
  isControlledAppInForeground: (currentForeground: ForegroundContext) => boolean

  /**
   * Ensure the controlled app is in the foreground.
   * Delegates to ChromeSessionManager.bringToFront() for Chrome,
   * or to executor.focusApp() for other apps.
   *
   * Returns true if the app was already in front, false if it needed switching.
   */
  ensureControlledAppInForeground: (params: {
    currentForeground: ForegroundContext
    chromeSessionManager: ChromeSessionManager
    activateApp: (appName: string) => Promise<void>
  }) => Promise<boolean>
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
    begin({ controlledApp, currentForeground }) {
      sessionCounter++
      session = {
        id: `ds_${sessionCounter}`,
        controlledApp,
        ownedWindows: [],
        userForegroundApp: currentForeground?.appName !== controlledApp
          ? currentForeground?.appName
          : undefined,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
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

    touch() {
      if (!session)
        return
      session.lastActiveAt = new Date().toISOString()
      stateManager.updateDesktopSession(session)
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

    async ensureControlledAppInForeground({ currentForeground, chromeSessionManager, activateApp }) {
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
        await chromeSessionManager.bringToFront()
      }
      else {
        await activateApp(session.controlledApp)
      }

      this.touch()
      return false
    },
  }
}
