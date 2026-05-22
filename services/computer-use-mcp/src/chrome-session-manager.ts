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

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'

import { runProcess } from './utils/process'
import { sleep } from './utils/sleep'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHROME_APP_NAME = 'Google Chrome'
const DEFAULT_CDP_PORT = 9222
const DEFAULT_CDP_PORT_SCAN_ATTEMPTS = 20

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ChromeSessionManager {
  /**
   * Ensure the agent has a usable Chrome window.
   *
   * - No active agent session → launch a dedicated Chrome profile with CDP
   * - Existing agent session still has a live Chrome window → reuse it
   *
   * Human-owned Chrome instances are not reused. The agent always launches its
   * own profile so browser-dom/CDP capture has a stable endpoint.
   */
  ensureAgentWindow: (options?: { url?: string, cdpPort?: number }) => Promise<ChromeSessionInfo>

  /**
   * Bring the agent's Chrome window to the foreground.
   * Returns false if the tracked session is missing, Chrome is no longer
   * running, or the tracked window is gone.
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

  async function hasChromeWindow(pid: number): Promise<boolean> {
    try {
      const { stdout } = await runProcess(config.binaries.osascript, [
        '-e',
        `tell application "System Events" to get count of windows of (first application process whose unix id is ${pid})`,
      ], { timeoutMs: config.timeoutMs })
      return Number.parseInt(stdout.trim(), 10) > 0
    }
    catch {
      return false
    }
  }

  async function terminateChromeProcess(pid: number): Promise<void> {
    await runProcess('kill', ['-TERM', String(pid)], { timeoutMs: config.timeoutMs }).catch(() => {})
    await sleep(250)

    if (!await isProcessAlive(pid)) {
      return
    }

    await runProcess('kill', ['-KILL', String(pid)], { timeoutMs: config.timeoutMs }).catch(() => {})
    await sleep(250)

    if (await isProcessAlive(pid)) {
      throw new Error(`Failed to terminate stale Chrome process ${pid}`)
    }
  }

  async function findAndTerminateChromeByProfile(profileDir: string, cdpPort: number): Promise<void> {
    const pid = await getChromePidForProfile(profileDir, cdpPort)
    if (!pid) {
      return
    }

    await terminateChromeProcess(pid)
  }

  async function clearSessionState(): Promise<void> {
    session = null
    previousForegroundApp = undefined
    if (activeProfileDir) {
      const profileDir = activeProfileDir
      activeProfileDir = undefined
      await rm(profileDir, { recursive: true, force: true }).catch(() => {})
      return
    }
    activeProfileDir = undefined
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

  async function getTrackedChromePid(trackedSession: ChromeSessionInfo): Promise<number | undefined> {
    if (!activeProfileDir || !trackedSession.cdpUrl) {
      return undefined
    }

    try {
      const cdpPort = Number.parseInt(new URL(trackedSession.cdpUrl).port, 10)
      if (!Number.isFinite(cdpPort)) {
        return undefined
      }

      return await getChromePidForProfile(activeProfileDir, cdpPort)
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

  async function canListenOnPort(port: number): Promise<boolean> {
    return await new Promise<boolean>((resolvePromise) => {
      const server = createServer()
      server.once('error', () => {
        resolvePromise(false)
      })
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolvePromise(true))
      })
    })
  }

  async function resolveLaunchCdpPort(requestedPort: number, explicit: boolean): Promise<number> {
    if (explicit) {
      return requestedPort
    }

    for (let index = 0; index < DEFAULT_CDP_PORT_SCAN_ATTEMPTS; index += 1) {
      const candidate = requestedPort + index
      if (await canListenOnPort(candidate)) {
        return candidate
      }
    }

    throw new Error(`Could not find an available Chrome CDP port starting from ${requestedPort}`)
  }

  async function launchChromeWithCdp(cdpPort: number, profileDir: string, url?: string): Promise<void> {
    // Chrome uses the user-data-dir root "First Run" sentinel to decide
    // whether the branded first-run dialog should appear.
    await writeFile(join(profileDir, 'First Run'), '').catch(() => {})

    const args = [
      '-na',
      CHROME_APP_NAME,
      '--args',
      '--new-window',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-features=ChromeWhatsNewUI',
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
      let ensureOutcome: ChromeSessionInfo['ensureOutcome'] = 'launched'

      if (session) {
        const trackedSession = session
        const trackedChromePid = await getTrackedChromePid(trackedSession)

        if (trackedChromePid === trackedSession.pid) {
          const stillRunning = await isProcessAlive(trackedSession.pid)
          const stillHasWindow = stillRunning && await hasChromeWindow(trackedSession.pid)
          if (stillHasWindow) {
            trackedSession.ensureOutcome = 'reused'
            return trackedSession
          }

          try {
            if (stillRunning) {
              ensureOutcome = 'recreated_after_missing_window'
              await terminateChromeProcess(trackedSession.pid)
            }
            else {
              ensureOutcome = 'recreated_after_process_exit'
            }
          }
          finally {
            // Chrome died or the tracked window disappeared — clear stale session.
            await clearSessionState()
            onSessionLost?.()
          }
        }
        else {
          // The tracked PID no longer resolves to the expected Chrome profile.
          // Treat it as stale and relaunch without touching that PID.
          ensureOutcome = 'recreated_after_process_exit'
          await clearSessionState()
          onSessionLost?.()
        }
      }

      // Record the user's current foreground app before we steal focus.
      previousForegroundApp = await getCurrentForegroundApp()

      const cdpPort = await resolveLaunchCdpPort(
        options?.cdpPort ?? DEFAULT_CDP_PORT,
        options?.cdpPort !== undefined,
      )
      const wasAlreadyRunning = await isChromeRunning()
      await mkdir(config.sessionRoot, { recursive: true })
      activeProfileDir = await mkdtemp(join(config.sessionRoot, 'chrome-profile-'))

      try {
        // Always launch a dedicated profile so CDP is stable even when Chrome is already running.
        await launchChromeWithCdp(cdpPort, activeProfileDir, options?.url)

        // Bring Chrome to front.
        await activateChrome()
        // Brief wait for activation.
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
          ensureOutcome,
          wasAlreadyRunning,
          windowId: `${pid}:0:${CHROME_APP_NAME}`,
          cdpUrl: `http://127.0.0.1:${cdpPort}`,
          pid,
          agentOwned: true,
          initialUrl: options?.url,
          createdAt: new Date().toISOString(),
        }

        return session
      }
      catch (error) {
        await findAndTerminateChromeByProfile(activeProfileDir, cdpPort)
        await clearSessionState()
        throw error
      }
    },

    async bringToFront() {
      if (!session)
        return false
      const stillRunning = await isProcessAlive(session.pid)
      const stillHasWindow = stillRunning && await hasChromeWindow(session.pid)
      if (!stillHasWindow) {
        await clearSessionState()
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
      void clearSessionState()
      if (hadSession) {
        onSessionLost?.()
      }
    },
  }
}
