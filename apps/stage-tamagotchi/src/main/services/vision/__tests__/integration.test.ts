/**
 * 视觉系统集成测试
 * 测试视觉系统的核心功能
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 模拟 Electron 的 ipcMain
const mockIpcHandlers = new Map()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel, handler) => {
      mockIpcHandlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel) => {
      mockIpcHandlers.delete(channel)
    }),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((text: string) => Buffer.from(text)),
    decryptString: vi.fn((buffer: Buffer) => buffer.toString()),
  },
  app: {
    getPath: vi.fn(() => '/tmp/test'),
  },
}))

// 模拟 consola
vi.mock('consola', () => ({
  consola: {
    create: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}))

// 模拟 fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

// 模拟 screenshot-desktop
vi.mock('screenshot-desktop', () => ({
  default: vi.fn(() => Promise.resolve(Buffer.from('fake-screenshot'))),
  listDisplays: vi.fn(() => Promise.resolve([{ id: 1, name: 'Display 1' }])),
}))

// 模拟 active-win
vi.mock('active-win', () => ({
  default: vi.fn(() => Promise.resolve({
    id: 123,
    title: 'Test Window',
    owner: { name: 'TestApp', processId: 456 },
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  })),
}))

// 模拟 robotjs
vi.mock('robotjs', () => ({
  moveMouse: vi.fn(),
  mouseClick: vi.fn(),
  keyTap: vi.fn(),
  typeString: vi.fn(),
  getScreenSize: vi.fn(() => ({ width: 1920, height: 1080 })),
  screen: {
    capture: vi.fn(() => ({ width: 1920, height: 1080, image: Buffer.from(''), colorAt: () => '#000000' })),
  },
}))

describe('vision System Integration', () => {
  beforeEach(() => {
    mockIpcHandlers.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('iPC Handlers', () => {
    it('should register all required IPC handlers', async () => {
      // 动态导入以触发 IPC 注册
      const { initVisionService } = await import('../index')
      await initVisionService()

      // 验证关键 IPC 处理器已注册
      expect(mockIpcHandlers.has('vision:captureScreen')).toBe(true)
      expect(mockIpcHandlers.has('vision:analyzeScreen')).toBe(true)
      expect(mockIpcHandlers.has('vision:getConfig')).toBe(true)
      expect(mockIpcHandlers.has('vision:setConfig')).toBe(true)
      expect(mockIpcHandlers.has('vision:getAuthState')).toBe(true)
      expect(mockIpcHandlers.has('vision:requestAuth')).toBe(true)
    })

    it('should handle screen capture request', async () => {
      const { initVisionService } = await import('../index')
      await initVisionService()

      const handler = mockIpcHandlers.get('vision:captureScreen')
      expect(handler).toBeDefined()

      const result = await handler()
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
    })

    it('should handle config get/set', async () => {
      const { initVisionService } = await import('../index')
      await initVisionService()

      const getHandler = mockIpcHandlers.get('vision:getConfig')
      const setHandler = mockIpcHandlers.get('vision:setConfig')

      expect(getHandler).toBeDefined()
      expect(setHandler).toBeDefined()

      // 测试获取配置
      const getResult = await getHandler()
      expect(getResult.success).toBe(true)
      expect(getResult.data).toBeDefined()

      // 测试设置配置
      const setResult = await setHandler({}, { enabled: true })
      expect(setResult.success).toBe(true)
    })
  })

  describe('auth Service', () => {
    it('should initialize auth service', async () => {
      const { initVisionService, getAuthState } = await import('../index')
      await initVisionService()

      const state = getAuthState()
      expect(state).toBeDefined()
      expect(state.isAuthorized).toBe(false)
      expect(state.denyCount).toBe(0)
    })

    it('should handle auth grant/revoke', async () => {
      const { initVisionService, grantAuth, revokeAuth, isAuthorized } = await import('../index')
      await initVisionService()

      // 初始状态
      expect(isAuthorized()).toBe(false)

      // 授权
      grantAuth()
      expect(isAuthorized()).toBe(true)

      // 撤销授权
      revokeAuth()
      expect(isAuthorized()).toBe(false)
    })
  })

  describe('privacy Service', () => {
    it('should detect sensitive information', async () => {
      const { protectPrivacy } = await import('../privacy')

      const text = 'Contact me at user@example.com or call 13812345678'
      const result = protectPrivacy(text)

      expect(result.detected.length).toBeGreaterThan(0)
      expect(result.sanitized).not.toContain('user@example.com')
      expect(result.sanitized).not.toContain('13812345678')
    })

    it('should handle text without sensitive info', async () => {
      const { protectPrivacy } = await import('../privacy')

      const text = 'This is a normal message without sensitive data'
      const result = protectPrivacy(text)

      expect(result.detected).toHaveLength(0)
      expect(result.sanitized).toBe(text)
    })
  })

  describe('performance Service', () => {
    it('should cache data', async () => {
      const { initPerformanceService, setCachedData, getCachedData } = await import('../performance')

      initPerformanceService()

      const key = 'test-key'
      const data = Buffer.from('test-data')

      // 设置缓存
      setCachedData(key, data)

      // 获取缓存
      const cached = getCachedData(key)
      expect(cached).toEqual(data)
    })

    it('should handle cache expiration', async () => {
      const { initPerformanceService, setCachedData, getCachedData } = await import('../performance')

      // 使用很短的 TTL 初始化
      initPerformanceService({ cacheTTL: 1 })

      const key = 'test-key'
      const data = Buffer.from('test-data')

      setCachedData(key, data)

      // 等待缓存过期
      await new Promise(resolve => setTimeout(resolve, 10))

      const cached = getCachedData(key)
      expect(cached).toBeNull()
    })
  })
})

describe('vision System E2E', () => {
  it('should complete full vision workflow', async () => {
    // 1. 初始化服务
    const { initVisionService } = await import('../index')
    await initVisionService({
      enabled: true,
      model: 'doubao-1.6-vision',
      apiKey: 'test-api-key',
    })

    // 2. 获取授权
    const { grantAuth, isAuthorized } = await import('../index')
    grantAuth()
    expect(isAuthorized()).toBe(true)

    // 3. 模拟屏幕捕获
    const captureHandler = mockIpcHandlers.get('vision:captureScreen')
    const captureResult = await captureHandler()
    expect(captureResult.success).toBe(true)

    // 4. 验证配置
    const configHandler = mockIpcHandlers.get('vision:getConfig')
    const configResult = await configHandler()
    expect(configResult.success).toBe(true)
    expect(configResult.data.enabled).toBe(true)
  })
})
