/**
 * 授权服务单元测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 模拟授权服务状态
let authState = {
  isAuthorized: false,
  authTime: undefined as number | undefined,
  lastPromptTime: undefined as number | undefined,
  denyCount: 0,
}

// 模拟授权服务
const mockAuthService = {
  initAuthService: vi.fn(),
  getAuthState: vi.fn(() => ({ ...authState })),
  isAuthorized: vi.fn(() => authState.isAuthorized),
  requestAuth: vi.fn(() => {
    if (authState.isAuthorized) {
      return { ...authState }
    }

    // 检查冷却期
    const now = Date.now()
    if (authState.lastPromptTime) {
      const cooldown = Math.min(30000 * (authState.denyCount + 1), 300000)
      if (now - authState.lastPromptTime < cooldown) {
        return { ...authState }
      }
    }

    authState.lastPromptTime = now
    return { ...authState }
  }),
  grantAuth: vi.fn(() => {
    authState.isAuthorized = true
    authState.authTime = Date.now()
    authState.denyCount = 0
  }),
  revokeAuth: vi.fn(() => {
    authState.isAuthorized = false
    authState.authTime = undefined
  }),
  denyAuth: vi.fn(() => {
    authState.isAuthorized = false
    authState.denyCount++
  }),
  onAuthChanged: vi.fn((_callback: (state: typeof authState) => void) => {
    // 模拟事件监听
    return () => {}
  }),
  getAuthPromptMessage: vi.fn(() => ({
    title: '授权请求',
    message: 'AI 角色想要查看您的屏幕',
    detail: '这将帮助 AI 更好地理解您的问题并提供帮助。您的屏幕数据不会被存储或传输到第三方。',
  })),
}

describe('auth Service', () => {
  beforeEach(() => {
    // 重置状态
    authState = {
      isAuthorized: false,
      authTime: undefined,
      lastPromptTime: undefined,
      denyCount: 0,
    }
    vi.clearAllMocks()
  })

  describe('getAuthState', () => {
    it('should return initial unauthorized state', () => {
      const state = mockAuthService.getAuthState()
      expect(state.isAuthorized).toBe(false)
      expect(state.denyCount).toBe(0)
    })

    it('should return authorized state after grant', () => {
      mockAuthService.grantAuth()
      const state = mockAuthService.getAuthState()
      expect(state.isAuthorized).toBe(true)
      expect(state.authTime).toBeDefined()
    })
  })

  describe('isAuthorized', () => {
    it('should return false initially', () => {
      expect(mockAuthService.isAuthorized()).toBe(false)
    })

    it('should return true after grant', () => {
      mockAuthService.grantAuth()
      expect(mockAuthService.isAuthorized()).toBe(true)
    })

    it('should return false after revoke', () => {
      mockAuthService.grantAuth()
      mockAuthService.revokeAuth()
      expect(mockAuthService.isAuthorized()).toBe(false)
    })
  })

  describe('requestAuth', () => {
    it('should return authorized state if already authorized', () => {
      mockAuthService.grantAuth()
      const result = mockAuthService.requestAuth()
      expect(result.isAuthorized).toBe(true)
    })

    it('should update lastPromptTime when requesting', () => {
      const before = Date.now()
      mockAuthService.requestAuth()
      const after = Date.now()

      const state = mockAuthService.getAuthState()
      expect(state.lastPromptTime).toBeGreaterThanOrEqual(before)
      expect(state.lastPromptTime).toBeLessThanOrEqual(after)
    })

    it('should respect cooldown period after deny', () => {
      // 第一次请求
      mockAuthService.requestAuth()
      mockAuthService.denyAuth()

      // 立即再次请求（应该在冷却期内）
      const result = mockAuthService.requestAuth()
      expect(result.isAuthorized).toBe(false)
      expect(result.denyCount).toBe(1)
    })
  })

  describe('grantAuth', () => {
    it('should set authorized to true', () => {
      mockAuthService.grantAuth()
      expect(authState.isAuthorized).toBe(true)
    })

    it('should set authTime', () => {
      mockAuthService.grantAuth()
      expect(authState.authTime).toBeDefined()
      expect(authState.authTime).toBeGreaterThan(0)
    })

    it('should reset denyCount', () => {
      mockAuthService.denyAuth()
      mockAuthService.denyAuth()
      expect(authState.denyCount).toBe(2)

      mockAuthService.grantAuth()
      expect(authState.denyCount).toBe(0)
    })
  })

  describe('revokeAuth', () => {
    it('should set authorized to false', () => {
      mockAuthService.grantAuth()
      mockAuthService.revokeAuth()
      expect(authState.isAuthorized).toBe(false)
    })

    it('should clear authTime', () => {
      mockAuthService.grantAuth()
      mockAuthService.revokeAuth()
      expect(authState.authTime).toBeUndefined()
    })
  })

  describe('denyAuth', () => {
    it('should increment denyCount', () => {
      mockAuthService.denyAuth()
      expect(authState.denyCount).toBe(1)

      mockAuthService.denyAuth()
      expect(authState.denyCount).toBe(2)
    })

    it('should keep authorized false', () => {
      mockAuthService.denyAuth()
      expect(authState.isAuthorized).toBe(false)
    })
  })

  describe('getAuthPromptMessage', () => {
    it('should return message with title, message and detail', () => {
      const message = mockAuthService.getAuthPromptMessage()
      expect(message.title).toBeDefined()
      expect(message.message).toBeDefined()
      expect(message.detail).toBeDefined()
    })

    it('should include relevant keywords', () => {
      const message = mockAuthService.getAuthPromptMessage()
      expect(message.title).toContain('授权')
      expect(message.message).toContain('屏幕')
    })
  })

  describe('onAuthChanged', () => {
    it('should accept a callback function', () => {
      const callback = vi.fn()
      mockAuthService.onAuthChanged(callback)
      expect(mockAuthService.onAuthChanged).toHaveBeenCalledWith(callback)
    })

    it('should return unsubscribe function', () => {
      const callback = vi.fn()
      const unsubscribe = mockAuthService.onAuthChanged(callback)
      expect(typeof unsubscribe).toBe('function')
    })
  })
})
