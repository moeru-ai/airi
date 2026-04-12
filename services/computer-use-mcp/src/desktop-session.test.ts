/**
 * Tests for DesktopSessionController.
 *
 * Pure in-memory tests — no OS calls. The session controller delegates
 * foreground management to callbacks, which we mock here.
 */

import type { ChromeSessionManager } from './chrome-session-manager'
import type { DesktopSessionController } from './desktop-session'
import type { ForegroundContext } from './types'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDesktopSessionController } from './desktop-session'
import { RunStateManager } from './state'

function fg(appName: string): ForegroundContext {
  return { available: true, appName, platform: 'darwin' }
}
function fgUnavailable(): ForegroundContext {
  return { available: false, platform: 'darwin' }
}

function mockChromeSessionManager(): ChromeSessionManager {
  return {
    ensureAgentWindow: vi.fn(),
    bringToFront: vi.fn().mockResolvedValue(undefined),
    restorePreviousForeground: vi.fn().mockResolvedValue(undefined),
    getSessionInfo: vi.fn().mockReturnValue(null),
    endSession: vi.fn(),
  }
}

describe('desktopSessionController', () => {
  let stateManager: RunStateManager
  let controller: DesktopSessionController

  beforeEach(() => {
    stateManager = new RunStateManager()
    controller = createDesktopSessionController(stateManager)
  })

  // -----------------------------------------------------------------------
  // begin / end
  // -----------------------------------------------------------------------

  describe('begin', () => {
    it('should create a session with the controlled app', () => {
      const session = controller.begin({
        controlledApp: 'Google Chrome',
        currentForeground: fg('Terminal'),
      })

      expect(session.controlledApp).toBe('Google Chrome')
      expect(session.userForegroundApp).toBe('Terminal')
      expect(session.ownedWindows).toEqual([])
      expect(session.id).toMatch(/^ds_/)
      expect(session.createdAt).toBeTruthy()
    })

    it('should not record userForegroundApp if same as controlled app', () => {
      const session = controller.begin({
        controlledApp: 'Google Chrome',
        currentForeground: fg('Google Chrome'),
      })

      expect(session.userForegroundApp).toBeUndefined()
    })

    it('should update RunState on begin', () => {
      controller.begin({
        controlledApp: 'Safari',
        currentForeground: fg('Finder'),
      })

      const state = stateManager.getState()
      expect(state.desktopSession?.controlledApp).toBe('Safari')
      expect(state.previousUserForegroundApp).toBe('Finder')
    })

    it('should handle undefined foreground', () => {
      const session = controller.begin({
        controlledApp: 'Chrome',
      })
      expect(session.userForegroundApp).toBeUndefined()
    })
  })

  describe('end', () => {
    it('should clear the session', () => {
      controller.begin({ controlledApp: 'Chrome' })
      expect(controller.getSession()).not.toBeNull()

      controller.end()
      expect(controller.getSession()).toBeNull()
      expect(stateManager.getState().desktopSession).toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // addOwnedWindow
  // -----------------------------------------------------------------------

  describe('addOwnedWindow', () => {
    it('should add a window to the session', () => {
      controller.begin({ controlledApp: 'Chrome' })
      controller.addOwnedWindow({
        appName: 'Google Chrome',
        windowId: '1234:0:Google Chrome',
        pid: 1234,
        agentLaunched: true,
      })

      expect(controller.getSession()!.ownedWindows).toHaveLength(1)
      expect(controller.getSession()!.ownedWindows[0].pid).toBe(1234)
    })

    it('should prevent duplicate windows', () => {
      controller.begin({ controlledApp: 'Chrome' })
      const window = {
        appName: 'Google Chrome',
        windowId: '1234:0:Google Chrome',
        pid: 1234,
        agentLaunched: true,
      }

      controller.addOwnedWindow(window)
      controller.addOwnedWindow(window)

      expect(controller.getSession()!.ownedWindows).toHaveLength(1)
    })

    it('should no-op if no session', () => {
      controller.addOwnedWindow({
        appName: 'Chrome',
        windowId: 'fake',
        pid: 0,
        agentLaunched: false,
      })
      // No error thrown, no session created
      expect(controller.getSession()).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // touch
  // -----------------------------------------------------------------------

  describe('touch', () => {
    it('should update lastActiveAt', () => {
      controller.begin({ controlledApp: 'Chrome' })
      const before = controller.getSession()!.lastActiveAt

      // Introduce a tiny delay to ensure the timestamp changes
      vi.useFakeTimers()
      vi.advanceTimersByTime(100)
      controller.touch()
      vi.useRealTimers()

      expect(controller.getSession()!.lastActiveAt).not.toBe(before)
    })

    it('should no-op if no session', () => {
      controller.touch() // should not throw
    })
  })

  // -----------------------------------------------------------------------
  // isControlledAppInForeground
  // -----------------------------------------------------------------------

  describe('isControlledAppInForeground', () => {
    it('should return true when controlled app is foreground', () => {
      controller.begin({ controlledApp: 'Google Chrome' })
      expect(controller.isControlledAppInForeground(fg('Google Chrome'))).toBe(true)
    })

    it('should return false when different app is foreground', () => {
      controller.begin({ controlledApp: 'Google Chrome' })
      expect(controller.isControlledAppInForeground(fg('Terminal'))).toBe(false)
    })

    it('should return false when foreground is unavailable', () => {
      controller.begin({ controlledApp: 'Chrome' })
      expect(controller.isControlledAppInForeground(fgUnavailable())).toBe(false)
    })

    it('should return false when no session', () => {
      expect(controller.isControlledAppInForeground(fg('Chrome'))).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // ensureControlledAppInForeground
  // -----------------------------------------------------------------------

  describe('ensureControlledAppInForeground', () => {
    it('should return true if controlled app is already in foreground', async () => {
      controller.begin({ controlledApp: 'Google Chrome' })
      const chromeManager = mockChromeSessionManager()

      const result = await controller.ensureControlledAppInForeground({
        currentForeground: fg('Google Chrome'),
        chromeSessionManager: chromeManager,
        activateApp: vi.fn(),
      })

      expect(result).toBe(true)
      expect(chromeManager.bringToFront).not.toHaveBeenCalled()
    })

    it('should use chromeSessionManager.bringToFront for Chrome', async () => {
      controller.begin({ controlledApp: 'Google Chrome', currentForeground: fg('Finder') })
      const chromeManager = mockChromeSessionManager()

      const result = await controller.ensureControlledAppInForeground({
        currentForeground: fg('Finder'),
        chromeSessionManager: chromeManager,
        activateApp: vi.fn(),
      })

      expect(result).toBe(false)
      expect(chromeManager.bringToFront).toHaveBeenCalled()
    })

    it('should use activateApp for non-Chrome apps', async () => {
      controller.begin({ controlledApp: 'Safari', currentForeground: fg('Finder') })
      const chromeManager = mockChromeSessionManager()
      const activateApp = vi.fn().mockResolvedValue(undefined)

      const result = await controller.ensureControlledAppInForeground({
        currentForeground: fg('Terminal'),
        chromeSessionManager: chromeManager,
        activateApp,
      })

      expect(result).toBe(false)
      expect(activateApp).toHaveBeenCalledWith('Safari')
      expect(chromeManager.bringToFront).not.toHaveBeenCalled()
    })

    it('should update userForegroundApp when switching', async () => {
      controller.begin({ controlledApp: 'Google Chrome', currentForeground: fg('Finder') })
      const chromeManager = mockChromeSessionManager()

      await controller.ensureControlledAppInForeground({
        currentForeground: fg('Terminal'),
        chromeSessionManager: chromeManager,
        activateApp: vi.fn(),
      })

      expect(controller.getSession()!.userForegroundApp).toBe('Terminal')
      expect(stateManager.getState().previousUserForegroundApp).toBe('Terminal')
    })

    it('should return true when no session exists', async () => {
      const result = await controller.ensureControlledAppInForeground({
        currentForeground: fg('Chrome'),
        chromeSessionManager: mockChromeSessionManager(),
        activateApp: vi.fn(),
      })

      expect(result).toBe(true)
    })
  })
})
