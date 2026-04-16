/**
 * Tests for ChromeSessionManager.
 *
 * All macOS shell interactions are mocked via `runProcess` to test
 * the logic without requiring a real Chrome instance.
 */

import type { ChromeSessionManager } from './chrome-session-manager'
import type { ComputerUseConfig } from './types'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createChromeSessionManager } from './chrome-session-manager'
import { runProcess } from './utils/process'

// Mock runProcess and sleep before importing the module under test
vi.mock('./utils/process', () => ({
  runProcess: vi.fn(),
}))
vi.mock('./utils/sleep', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}))

const mockedRunProcess = vi.mocked(runProcess)

function makeConfig(): ComputerUseConfig {
  return {
    executor: 'macos-local',
    sessionTag: 'test',
    sessionRoot: '/tmp/test',
    screenshotsDir: '/tmp/test/screenshots',
    timeoutMs: 5000,
    approvalMode: 'never',
    binaries: {
      swift: '/usr/bin/swift',
      screencapture: '/usr/sbin/screencapture',
      open: '/usr/bin/open',
      osascript: '/usr/bin/osascript',
    },
    browserDomBridge: { enabled: false },
    openableApps: [],
  } as ComputerUseConfig
}

function ok(stdout = ''): any {
  return { stdout, stderr: '' }
}

/**
 * Mock for "chrome not running → launch" flow (first call, no existing session).
 *
 * Call sequence when `session` is null:
 * 1. osascript (getCurrentForegroundApp)
 * 2. pgrep (isChromeRunning for wasAlreadyRunning) → reject (not running)
 * 3. open (launchChromeWithCdp)
 * 4. osascript (activateChrome)
 * 5. pgrep (getChromeMainPid) → ok with pid
 */
function mockLaunchFlow(pid: number, userApp = '') {
  mockedRunProcess
    .mockResolvedValueOnce(ok(userApp)) // 1. getCurrentForegroundApp
    .mockRejectedValueOnce(new Error('no match')) // 2. isChromeRunning → false
    .mockResolvedValueOnce(ok()) // 3. open command
    .mockResolvedValueOnce(ok()) // 4. activateChrome
    .mockResolvedValueOnce(ok(`${pid}\n`)) // 5. getChromeMainPid
}

/**
 * Mock for "chrome already running → new window" flow (first call, no existing session).
 *
 * Call sequence when `session` is null:
 * 1. osascript (getCurrentForegroundApp)
 * 2. pgrep (isChromeRunning for wasAlreadyRunning) → ok (running)
 * 3. osascript (createNewWindow)
 * 4. osascript (activateChrome)
 * 5. pgrep (getChromeMainPid)
 */
function mockJoinFlow(pid: number, userApp = 'Terminal') {
  mockedRunProcess
    .mockResolvedValueOnce(ok(userApp)) // 1. getCurrentForegroundApp
    .mockResolvedValueOnce(ok(`${pid}\n`)) // 2. isChromeRunning → true
    .mockResolvedValueOnce(ok()) // 3. createNewWindow
    .mockResolvedValueOnce(ok()) // 4. activateChrome
    .mockResolvedValueOnce(ok(`${pid}\n`)) // 5. getChromeMainPid
}

describe('chromeSessionManager', () => {
  let manager: ChromeSessionManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = createChromeSessionManager(makeConfig())
  })

  // -----------------------------------------------------------------------
  // ensureAgentWindow
  // -----------------------------------------------------------------------

  describe('ensureAgentWindow', () => {
    it('should launch Chrome when not running', async () => {
      mockLaunchFlow(12345)

      const info = await manager.ensureAgentWindow()

      expect(info.wasAlreadyRunning).toBe(false)
      expect(info.agentOwned).toBe(true)
      expect(info.pid).toBe(12345)
      expect(info.cdpUrl).toBe('http://127.0.0.1:9222')
      expect(info.windowId).toBe('12345:0:Google Chrome')
      expect(info.createdAt).toBeTruthy()
    })

    it('should create new window when Chrome is already running', async () => {
      mockJoinFlow(99999, 'Terminal')

      const info = await manager.ensureAgentWindow()

      expect(info.wasAlreadyRunning).toBe(true)
      expect(info.agentOwned).toBe(true)
      expect(info.pid).toBe(99999)
      // No CDP URL when joining existing Chrome
      expect(info.cdpUrl).toBeUndefined()
    })

    it('should reuse an existing session when the agent launched a dedicated Chrome instance', async () => {
      mockLaunchFlow(11111)
      const first = await manager.ensureAgentWindow()

      // Second call: session exists → isChromeRunning check (1 call)
      mockedRunProcess.mockResolvedValueOnce(ok('11111\n')) // isChromeRunning → still alive
      const second = await manager.ensureAgentWindow()

      expect(second).toBe(first)
    })

    it('should create a fresh agent window on repeated calls when joining an existing Chrome instance', async () => {
      mockJoinFlow(99999, 'Terminal')
      const first = await manager.ensureAgentWindow()

      vi.clearAllMocks()

      mockedRunProcess
        .mockResolvedValueOnce(ok('99999\n')) // session reuse check → Chrome still running
      mockJoinFlow(99999, 'Terminal')

      const second = await manager.ensureAgentWindow()

      expect(second).not.toBe(first)
      expect(second.wasAlreadyRunning).toBe(true)
      expect(second.pid).toBe(99999)
      expect(mockedRunProcess.mock.calls[3]?.[0]).toBe('/usr/bin/osascript')
      expect(mockedRunProcess.mock.calls[3]?.[1]).toEqual(['-e', 'tell application "Google Chrome" to make new window'])
    })

    it('should recreate session if Chrome crashed between calls', async () => {
      mockLaunchFlow(11111)
      const first = await manager.ensureAgentWindow()
      expect(first.pid).toBe(11111)

      // Second call: session exists → isChromeRunning fails (Chrome crashed)
      mockedRunProcess.mockRejectedValueOnce(new Error('no match'))
      // session=null now, goes through full launch flow (5 calls)
      mockLaunchFlow(22222)

      const second = await manager.ensureAgentWindow()
      expect(second.pid).toBe(22222)
      expect(second).not.toBe(first)
    })

    it('should pass custom URL to Chrome', async () => {
      mockLaunchFlow(33333)

      const info = await manager.ensureAgentWindow({ url: 'https://example.com' })
      expect(info.initialUrl).toBe('https://example.com')
    })

    it('should pass URL to osascript as argv instead of interpolating it into script source', async () => {
      const maliciousUrl = 'https://example.com/" & do shell script "touch /tmp/pwned" & "'
      mockJoinFlow(33333, 'Terminal')

      await manager.ensureAgentWindow({ url: maliciousUrl })

      const createWindowCall = mockedRunProcess.mock.calls[2]
      expect(createWindowCall?.[0]).toBe('/usr/bin/osascript')
      expect(createWindowCall?.[1]).toEqual([
        '-e',
        expect.stringContaining('item 1 of argv'),
        '--',
        maliciousUrl,
      ])
      expect(createWindowCall?.[1]?.[1]).not.toContain(maliciousUrl)
    })

    it('should use custom CDP port', async () => {
      mockLaunchFlow(44444)

      const info = await manager.ensureAgentWindow({ cdpPort: 9333 })
      expect(info.cdpUrl).toBe('http://127.0.0.1:9333')
    })

    it('should throw if Chrome PID cannot be obtained after launch', async () => {
      mockedRunProcess
        .mockResolvedValueOnce(ok()) // 1. foreground
        .mockRejectedValueOnce(new Error('no match')) // 2. wasAlreadyRunning → false
        .mockResolvedValueOnce(ok()) // 3. launch
        .mockResolvedValueOnce(ok()) // 4. activate
        .mockRejectedValueOnce(new Error('no match')) // 5. getChromeMainPid → fails

      await expect(manager.ensureAgentWindow()).rejects.toThrow('Failed to get Chrome PID')
    })

    it('should record the user\'s previous foreground app', async () => {
      mockLaunchFlow(55555, 'Finder')

      await manager.ensureAgentWindow()

      // First call should have been getCurrentForegroundApp
      const firstCall = mockedRunProcess.mock.calls[0]
      expect(firstCall[1]).toContainEqual(expect.stringContaining('first application process'))
    })
  })

  // -----------------------------------------------------------------------
  // bringToFront
  // -----------------------------------------------------------------------

  describe('bringToFront', () => {
    it('should activate Chrome when session exists', async () => {
      mockLaunchFlow(11111)
      await manager.ensureAgentWindow()
      vi.clearAllMocks()

      mockedRunProcess
        .mockResolvedValueOnce(ok('11111\n')) // isChromeRunning
        .mockResolvedValueOnce(ok()) // activateChrome

      await manager.bringToFront()

      expect(mockedRunProcess).toHaveBeenCalledTimes(2)
      const activateCall = mockedRunProcess.mock.calls[1]
      expect(activateCall[1]).toEqual(['-e', 'tell application "Google Chrome" to activate'])
    })

    it('should be no-op when no session exists', async () => {
      await manager.bringToFront()
      expect(mockedRunProcess).not.toHaveBeenCalled()
    })

    it('should clear session if Chrome crashed', async () => {
      mockLaunchFlow(11111)
      await manager.ensureAgentWindow()
      vi.clearAllMocks()

      // Chrome crashed
      mockedRunProcess.mockRejectedValueOnce(new Error('no match'))

      await manager.bringToFront()
      expect(manager.getSessionInfo()).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // restorePreviousForeground
  // -----------------------------------------------------------------------

  describe('restorePreviousForeground', () => {
    it('should activate the user\'s previous app', async () => {
      mockLaunchFlow(11111, 'Terminal')
      await manager.ensureAgentWindow()
      vi.clearAllMocks()

      mockedRunProcess.mockResolvedValueOnce(ok())

      await manager.restorePreviousForeground()

      expect(mockedRunProcess).toHaveBeenCalledWith(
        '/usr/bin/osascript',
        ['-e', 'tell application "Terminal" to activate'],
        expect.any(Object),
      )
    })

    it('should be no-op if user was already in Chrome', async () => {
      mockLaunchFlow(11111, 'Google Chrome')
      await manager.ensureAgentWindow()
      vi.clearAllMocks()

      await manager.restorePreviousForeground()
      expect(mockedRunProcess).not.toHaveBeenCalled()
    })

    it('should be no-op if no session was created', async () => {
      await manager.restorePreviousForeground()
      expect(mockedRunProcess).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // session lifecycle
  // -----------------------------------------------------------------------

  describe('session lifecycle', () => {
    it('should return null before any session', () => {
      expect(manager.getSessionInfo()).toBeNull()
    })

    it('should return session info after ensureAgentWindow', async () => {
      mockLaunchFlow(55555)

      await manager.ensureAgentWindow()
      const info = manager.getSessionInfo()
      expect(info).not.toBeNull()
      expect(info!.pid).toBe(55555)
      expect(info!.agentOwned).toBe(true)
    })

    it('should clear session on endSession', async () => {
      mockLaunchFlow(55555)
      await manager.ensureAgentWindow()
      expect(manager.getSessionInfo()).not.toBeNull()

      manager.endSession()
      expect(manager.getSessionInfo()).toBeNull()
    })

    it('should restore fully after endSession and re-ensureAgentWindow', async () => {
      mockLaunchFlow(11111)
      await manager.ensureAgentWindow()
      manager.endSession()

      mockLaunchFlow(22222)
      const info = await manager.ensureAgentWindow()
      expect(info.pid).toBe(22222)
    })
  })
})
