/**
 * Chrome Session Manager — agent-owned Chrome window lifecycle.
 *
 * Responsibilities:
 * - Launch a dedicated Chrome profile with CDP
 * - Track the launched browser PID
 * - Bring agent window to front / restore user's previous foreground
 *
 * macOS only. Uses AppleScript and `open` CLI for Chrome lifecycle control.
 */

import type { ChromeSessionInfo, ComputerUseConfig } from './types'

import { join } from 'node:path'
import { mkdir, mkdtemp } from 'node:fs/promises'

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
   * - No active agent session → launch a dedicated Chrome profile with CDP
   * - Existing agent session still alive → reuse it
   *
   * Human-owned Chrome instances are not reused. The agent always launches its
   * own profile so browser-dom/CDP capture has a stable endpoint.
   */
  ensureAgentWindow: (options?: { url?: string, cdpPort?: number }) => Promise<ChromeSessionInfo>

  /**
   * Bring the agent's Chrome window to the foreground.
   * Returns false if the tracked session is missing or Chrome is no longer running.
   */
  bringToFront: () => Promise<boolean>

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
  let activeProfileDir: string | undefined

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

  async function isProcessAlive(pid: number): Promise<boolean> {
    try {
      const { stdout } = await runProcess('ps', ['-p', String(pid), '-o', 'pid='], {
        timeoutMs: config.timeoutMs,
      })
      return stdout.trim().length > 0
    }
    catch {
      return false
    }
  }

  async function getChromePidForProfile(profileDir: string, cdpPort: number): Promise<number | undefined> {
    try {
      const { stdout } = await runProcess('ps', ['-axww', '-o', 'pid=,command='], {
        timeoutMs: config.timeoutMs,
      })
      const matchingLine = stdout
        .split('\n')
        .map(line => line.trim())
        .find(line =>
          line.includes('/Contents/MacOS/Google Chrome')
          && !line.includes('Helper')
          && line.includes(`--user-data-dir=${profileDir}`)
          && line.includes(`--remote-debugging-port=${cdpPort}`),
        )

      if (!matchingLine) {
        return undefined
      }

      const pidText = matchingLine.split(/\s+/u)[0]
      const pid = Number(pidText)
      return Number.isFinite(pid) ? pid : undefined
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

  async function launchChromeWithCdp(cdpPort: number, profileDir: string, url?: string): Promise<void> {
    const args = [
      '-na',
      CHROME_APP_NAME,
      '--args',
      '--new-window',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profileDir}`,
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
      if (session) {
        const stillRunning = await isProcessAlive(session.pid)
        if (stillRunning) {
          return session
        }
        if (!stillRunning) {
          // Chrome died — clear stale session.
          onSessionLost?.()
        }
        session = null
        activeProfileDir = undefined
      }

      // Record the user's current foreground app before we steal focus
      previousForegroundApp = await getCurrentForegroundApp()

      const cdpPort = options?.cdpPort ?? DEFAULT_CDP_PORT
      const wasAlreadyRunning = await isChromeRunning()
      await mkdir(config.sessionRoot, { recursive: true })
      activeProfileDir = await mkdtemp(join(config.sessionRoot, 'chrome-profile-'))

      // Always launch a dedicated profile so CDP is stable even when Chrome is already running.
      await launchChromeWithCdp(cdpPort, activeProfileDir, options?.url)

      // Bring Chrome to front
      await activateChrome()
      // Brief wait for activation
      await sleep(300)

      const deadline = Date.now() + config.timeoutMs
      let pid: number | undefined
      while (Date.now() < deadline) {
        pid = await getChromePidForProfile(activeProfileDir, cdpPort)
        if (pid) {
          break
        }
        await sleep(250)
      }
      if (!pid) {
        throw new Error('Failed to get Chrome PID after launch')
      }

      session = {
        wasAlreadyRunning,
        windowId: `${pid}:0:${CHROME_APP_NAME}`,
        cdpUrl: `http://127.0.0.1:${cdpPort}`,
        pid,
        agentOwned: true,
        initialUrl: options?.url,
        createdAt: new Date().toISOString(),
      }

      return session
    },

    async bringToFront() {
      if (!session)
        return false
      const stillRunning = await isProcessAlive(session.pid)
      if (!stillRunning) {
        session = null
        activeProfileDir = undefined
        onSessionLost?.()
        return false
      }
      await activateChrome()
      return true
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
      activeProfileDir = undefined
      previousForegroundApp = undefined
      if (hadSession) {
        onSessionLost?.()
      }
    },
  }
}
