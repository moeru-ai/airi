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

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn().mockResolvedValue('/tmp/test/chrome-profile-abc123'),
  rm: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./utils/process', () => ({
  runProcess: vi.fn(),
}))
vi.mock('./utils/sleep', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}))

import { mkdir, mkdtemp, rm } from 'node:fs/promises'

const mockedRunProcess = vi.mocked(runProcess)
const mockedMkdir = vi.mocked(mkdir)
const mockedMkdtemp = vi.mocked(mkdtemp)
const mockedRm = vi.mocked(rm)

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

function mockLaunchFlow(pid: number, userApp = 'Terminal', cdpPort = 9222) {
  mockedRunProcess
    .mockResolvedValueOnce(ok(userApp)) // foreground app
    .mockRejectedValueOnce(new Error('no match')) // wasAlreadyRunning → false
    .mockResolvedValueOnce(ok()) // open
    .mockResolvedValueOnce(ok()) // activateChrome
    .mockResolvedValueOnce(ok(
      `${pid} /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/tmp/test/chrome-profile-abc123 --remote-debugging-port=${cdpPort}\n`,
    )) // getChromePidForProfile
}

function mockReuseFlow(pid: number) {
  mockedRunProcess
    .mockResolvedValueOnce(ok(`${pid}\n`)) // isProcessAlive
    .mockResolvedValueOnce(ok('1\n')) // hasChromeWindow
}

function mockWindowMissingFlow(pid: number) {
  mockedRunProcess
    .mockResolvedValueOnce(ok(`${pid}\n`)) // isProcessAlive
    .mockResolvedValueOnce(ok('0\n')) // hasChromeWindow
}

describe('chromeSessionManager', () => {
  let manager: ChromeSessionManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = createChromeSessionManager(makeConfig())
  })

  describe('ensureAgentWindow', () => {
    it('launches a dedicated Chrome profile with CDP', async () => {
      mockLaunchFlow(12345)

      const info = await manager.ensureAgentWindow()

      expect(info.wasAlreadyRunning).toBe(false)
      expect(info.agentOwned).toBe(true)
      expect(info.pid).toBe(12345)
      expect(info.cdpUrl).toBe('http://127.0.0.1:9222')
      expect(info.windowId).toBe('12345:0:Google Chrome')
      expect(mockedMkdir).toHaveBeenCalledWith('/tmp/test', { recursive: true })
      expect(mockedMkdtemp).toHaveBeenCalledWith('/tmp/test/chrome-profile-')
      expect(mockedRunProcess.mock.calls[2]).toEqual([
        '/usr/bin/open',
        [
          '-na',
          'Google Chrome',
          '--args',
          '--new-window',
          '--remote-debugging-port=9222',
          '--user-data-dir=/tmp/test/chrome-profile-abc123',
        ],
        expect.any(Object),
      ])
    })

    it('reuses an alive agent session', async () => {
      mockLaunchFlow(11111)
      const first = await manager.ensureAgentWindow()

      vi.clearAllMocks()
      mockReuseFlow(11111)

      const second = await manager.ensureAgentWindow()

      expect(second).toBe(first)
    })

    it('recreates the session if the tracked process is gone', async () => {
      mockLaunchFlow(11111)
      await manager.ensureAgentWindow()

      vi.clearAllMocks()
      mockedRunProcess.mockRejectedValueOnce(new Error('no match'))
      mockLaunchFlow(22222)

      const second = await manager.ensureAgentWindow()

      expect(second.pid).toBe(22222)
      expect(second).not.toBeNull()
    })

    it('recreates the session if the Chrome process is alive but the agent window is gone', async () => {
      mockLaunchFlow(11111)
      await manager.ensureAgentWindow()

      vi.clearAllMocks()
      mockWindowMissingFlow(11111)
      mockedRunProcess.mockResolvedValueOnce(ok()) // terminateChromeProcess: kill -TERM
      mockedRunProcess.mockResolvedValueOnce(ok()) // terminateChromeProcess: post-TERM liveness check
      mockLaunchFlow(22222)

      const second = await manager.ensureAgentWindow()

      expect(second.pid).toBe(22222)
      expect(mockedRunProcess).toHaveBeenCalledWith('kill', ['-TERM', '11111'], expect.any(Object))
      expect(mockedRunProcess).not.toHaveBeenCalledWith('kill', ['-KILL', '11111'], expect.any(Object))
      expect(mockedRunProcess).toHaveBeenCalledWith('/usr/bin/osascript', [
        '-e',
        'tell application "System Events" to get count of windows of (first application process whose unix id is 11111)',
      ], expect.any(Object))
    })

    it('passes a custom CDP port and URL through', async () => {
      mockLaunchFlow(33333, 'Terminal', 9333)

      const info = await manager.ensureAgentWindow({
        cdpPort: 9333,
        url: 'https://example.com',
      })

      expect(info.cdpUrl).toBe('http://127.0.0.1:9333')
      expect(info.initialUrl).toBe('https://example.com')
      expect(mockedRunProcess.mock.calls[2]?.[1]).toContain('--user-data-dir=/tmp/test/chrome-profile-abc123')
      expect(mockedRunProcess.mock.calls[2]?.[1]).toContain('https://example.com')
    })

    it('cleans up the active chrome profile directory on endSession', async () => {
      mockLaunchFlow(11111)
      await manager.ensureAgentWindow()

      vi.clearAllMocks()
      manager.endSession()

      expect(mockedRm).toHaveBeenCalledWith('/tmp/test/chrome-profile-abc123', {
        recursive: true,
        force: true,
      })
      expect(manager.getSessionInfo()).toBeNull()
    })

    it('cleans up the active chrome profile when relaunching after a missing window', async () => {
      mockLaunchFlow(11111)
      await manager.ensureAgentWindow()

      vi.clearAllMocks()
      mockWindowMissingFlow(11111)
      mockedRunProcess.mockResolvedValueOnce(ok()) // terminateChromeProcess: kill -TERM
      mockedRunProcess.mockResolvedValueOnce(ok()) // terminateChromeProcess: post-TERM liveness check
      mockLaunchFlow(22222)

      const second = await manager.ensureAgentWindow()

      expect(second.pid).toBe(22222)
      expect(mockedRm).toHaveBeenCalledWith('/tmp/test/chrome-profile-abc123', {
        recursive: true,
        force: true,
      })
    })
  })

  describe('bringToFront', () => {
    it('activates Chrome when session exists', async () => {
      mockLaunchFlow(11111)
      await manager.ensureAgentWindow()

      vi.clearAllMocks()
      mockedRunProcess.mockResolvedValueOnce(ok('11111\n'))
      mockedRunProcess.mockResolvedValueOnce(ok('1\n'))
      mockedRunProcess.mockResolvedValueOnce(ok())

      const result = await manager.bringToFront()

      expect(result).toBe(true)
      expect(mockedRunProcess).toHaveBeenCalledTimes(3)
    })

    it('returns false when session is gone', async () => {
      mockLaunchFlow(11111)
      await manager.ensureAgentWindow()

      vi.clearAllMocks()
      mockedRunProcess.mockRejectedValueOnce(new Error('no match'))

      const result = await manager.bringToFront()

      expect(result).toBe(false)
      expect(manager.getSessionInfo()).toBeNull()
    })

    it('returns false when the agent window is gone even if the process still exists', async () => {
      mockLaunchFlow(11111)
      await manager.ensureAgentWindow()

      vi.clearAllMocks()
      mockWindowMissingFlow(11111)

      const result = await manager.bringToFront()

      expect(result).toBe(false)
      expect(manager.getSessionInfo()).toBeNull()
    })
  })
})
