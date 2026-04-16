/**
 * Chrome Session Manager — agent-owned Chrome window lifecycle.
 *
 * Responsibilities:
 * - Detect whether Chrome is already running
 * - Launch Chrome with CDP if not running
 * - Create a new window in existing Chrome
 * - Track window identity via PID
 * - Bring agent window to front / restore user's previous foreground
 *
 * macOS only. Uses AppleScript and `open` CLI for Chrome lifecycle control.
 */

import type { ChromeSessionInfo, ComputerUseConfig } from './types'

import { runProcess } from './utils/process'
import { sleep } from './utils/sleep'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHROME_APP_NAME = 'Google Chrome'
const DEFAULT_CDP_PORT = 9222

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ChromeSessionManager {
  /**
   * Ensure the agent has a usable Chrome window.
   *
   * - Chrome not running → launch with CDP flag + new window
   * - Chrome running → create new window in existing instance
   *
   * Reuses the cached session only when the agent launched a dedicated Chrome
   * instance itself. When joining an existing user-owned Chrome process, a
   * fresh window must be created on every ensure because this module does not
   * track a verifiable OS window handle for the agent tab/window.
   */
  ensureAgentWindow: (options?: { url?: string, cdpPort?: number }) => Promise<ChromeSessionInfo>

  /**
   * Bring the agent's Chrome window to the foreground.
   * No-op if no session exists.
   */
  bringToFront: () => Promise<void>

  /**
   * Restore the user's previous foreground app (recorded at session start).
   */
  restorePreviousForeground: () => Promise<void>

  /**
   * Get the current session info (null if no session).
   */
  getSessionInfo: () => ChromeSessionInfo | null

  /**
   * End the session. Does NOT close Chrome — just clears the tracked state.
   */
  endSession: () => void
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createChromeSessionManager(
  config: ComputerUseConfig,
  options?: { onSessionLost?: () => void },
): ChromeSessionManager {
  let session: ChromeSessionInfo | null = null
  let previousForegroundApp: string | undefined
  const onSessionLost = options?.onSessionLost

  // -- Helpers ------------------------------------------------------------

  async function isChromeRunning(): Promise<boolean> {
    try {
      const { stdout } = await runProcess('pgrep', ['-x', 'Google Chrome'], {
        timeoutMs: config.timeoutMs,
      })
      return stdout.trim().length > 0
    }
    catch {
      // pgrep exits non-zero when no match
      return false
    }
  }

  async function getChromeMainPid(): Promise<number | undefined> {
    try {
      const { stdout } = await runProcess('pgrep', ['-x', 'Google Chrome'], {
        timeoutMs: config.timeoutMs,
      })
      const pids = stdout.trim().split('\n').map(Number).filter(n => !Number.isNaN(n))
      // The lowest PID is typically the main Chrome process
      return pids.length > 0 ? Math.min(...pids) : undefined
    }
    catch {
      return undefined
    }
  }

  async function getCurrentForegroundApp(): Promise<string | undefined> {
    try {
      const { stdout } = await runProcess(config.binaries.osascript, [
        '-e',
        'tell application "System Events" to get name of first application process whose frontmost is true',
      ], { timeoutMs: config.timeoutMs })
      return stdout.trim() || undefined
    }
    catch {
      return undefined
    }
  }

  async function launchChromeWithCdp(cdpPort: number, url?: string): Promise<void> {
    const args = [
      '-na',
      CHROME_APP_NAME,
      '--args',
      '--new-window',
      `--remote-debugging-port=${cdpPort}`,
    ]
    if (url) {
      args.push(url)
    }

    await runProcess(config.binaries.open, args, {
      timeoutMs: config.timeoutMs,
    })

    // Wait for Chrome to finish launching
    await sleep(2000)
  }

  async function createNewWindow(url?: string): Promise<void> {
    // NOTICE: Pass the URL as an `osascript` argv value instead of interpolating
    // it into the AppleScript source. `desktop_ensure_chrome` accepts arbitrary
    // strings, so direct interpolation creates an AppleScript injection path when
    // the URL contains quotes. The review report on PR #1649 correctly called this
    // out as a P1 command-injection issue.
    const script = url
      ? `on run argv
tell application "${CHROME_APP_NAME}" to make new window with properties {mode:"normal"}
tell application "${CHROME_APP_NAME}" to set URL of active tab of front window to item 1 of argv
end run`
      : `tell application "${CHROME_APP_NAME}" to make new window`

    const args = url
      ? ['-e', script, '--', url]
      : ['-e', script]

    await runProcess(config.binaries.osascript, args, {
      timeoutMs: config.timeoutMs,
    })

    // Brief delay for the window to appear
    await sleep(500)
  }

  async function activateChrome(): Promise<void> {
    await runProcess(config.binaries.osascript, [
      '-e',
      `tell application "${CHROME_APP_NAME}" to activate`,
    ], { timeoutMs: config.timeoutMs })
  }

  async function activateApp(appName: string): Promise<void> {
    try {
      await runProcess(config.binaries.osascript, [
        '-e',
        `tell application "${appName}" to activate`,
      ], { timeoutMs: config.timeoutMs })
    }
    catch {
      // Best-effort: the app might have been closed
    }
  }

  // -- Public API ---------------------------------------------------------

  return {
    async ensureAgentWindow(options) {
      // If we already have a session, only reuse it when the agent launched a
      // dedicated Chrome instance. Joined sessions only cache process metadata,
      // not a verifiable OS window handle, so blindly reusing them after the
      // user closes that window would redirect later focus/click flows onto a
      // different Chrome window.
      if (session) {
        const stillRunning = await isChromeRunning()
        if (stillRunning && !session.wasAlreadyRunning) {
          return session
        }
        if (!stillRunning) {
          // Chrome died — clear stale session.
          onSessionLost?.()
        }
        session = null
      }

      // Record the user's current foreground app before we steal focus
      previousForegroundApp = await getCurrentForegroundApp()

      const cdpPort = options?.cdpPort ?? DEFAULT_CDP_PORT
      const wasAlreadyRunning = await isChromeRunning()

      if (wasAlreadyRunning) {
        // Chrome is running — create a new window in the existing instance
        await createNewWindow(options?.url)
      }
      else {
        // Chrome not running — launch with CDP
        await launchChromeWithCdp(cdpPort, options?.url)
      }

      // Bring Chrome to front
      await activateChrome()
      // Brief wait for activation
      await sleep(300)

      // Get the Chrome PID
      const pid = await getChromeMainPid()
      if (!pid) {
        throw new Error('Failed to get Chrome PID after launch')
      }

      session = {
        wasAlreadyRunning,
        windowId: `${pid}:0:${CHROME_APP_NAME}`,
        cdpUrl: wasAlreadyRunning ? undefined : `http://127.0.0.1:${cdpPort}`,
        pid,
        agentOwned: true,
        initialUrl: options?.url,
        createdAt: new Date().toISOString(),
      }

      return session
    },

    async bringToFront() {
      if (!session)
        return
      const stillRunning = await isChromeRunning()
      if (!stillRunning) {
        session = null
        onSessionLost?.()
        return
      }
      await activateChrome()
    },

    async restorePreviousForeground() {
      if (previousForegroundApp && previousForegroundApp !== CHROME_APP_NAME) {
        await activateApp(previousForegroundApp)
      }
    },

    getSessionInfo() {
      return session
    },

    endSession() {
      const hadSession = session !== null
      session = null
      previousForegroundApp = undefined
      if (hadSession) {
        onSessionLost?.()
      }
    },
  }
}
