import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock @moeru/three-mmd before importing the module
vi.mock('@moeru/three-mmd', () => ({
  MMDLoader: vi.fn().mockImplementation(function (this: any, plugins: any[], manager: any) {
    this.plugins = plugins
    this.manager = manager
    this.loadAsync = vi.fn()
    return this
  }),
  VMDLoader: vi.fn().mockImplementation(function (this: any, manager?: any) {
    this.manager = manager
    this.loadAsync = vi.fn()
    return this
  }),
}))

// Mock stage-ui-live2d mmd-zip-loader
vi.mock('@proj-airi/stage-ui-live2d/utils/mmd-zip-loader', () => ({
  createMmdLoadingManager: vi.fn().mockReturnValue({
    setURLModifier: vi.fn(),
  }),
  registerMmdTextures: vi.fn(),
  unregisterMmdTextures: vi.fn(),
}))

describe('mmd/loader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset module cache to test singleton behavior
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('useMMDLoader', () => {
    it('should return a singleton MMDLoader instance', async () => {
      const { useMMDLoader } = await import('./loader')

      const loader1 = useMMDLoader()
      const loader2 = useMMDLoader()

      expect(loader1).toBe(loader2)
    })

    it('should create MMDLoader with custom LoadingManager', async () => {
      const { useMMDLoader } = await import('./loader')
      const { MMDLoader } = await import('@moeru/three-mmd')
      const { createMmdLoadingManager } = await import('@proj-airi/stage-ui-live2d/utils/mmd-zip-loader')

      useMMDLoader()

      expect(MMDLoader).toHaveBeenCalled()
      expect(createMmdLoadingManager).toHaveBeenCalled()
    })
  })

  describe('useVMDLoader', () => {
    it('should return a singleton VMDLoader instance', async () => {
      const { useVMDLoader } = await import('./loader')

      const loader1 = useVMDLoader()
      const loader2 = useVMDLoader()

      expect(loader1).toBe(loader2)
    })

    it('should create VMDLoader instance', async () => {
      const { useVMDLoader } = await import('./loader')
      const { VMDLoader } = await import('@moeru/three-mmd')

      useVMDLoader()

      expect(VMDLoader).toHaveBeenCalled()
    })
  })

  describe('exports', () => {
    it('should export registerMmdTextures', async () => {
      const { registerMmdTextures } = await import('./loader')

      expect(registerMmdTextures).toBeDefined()
      expect(typeof registerMmdTextures).toBe('function')
    })

    it('should export unregisterMmdTextures', async () => {
      const { unregisterMmdTextures } = await import('./loader')

      expect(unregisterMmdTextures).toBeDefined()
      expect(typeof unregisterMmdTextures).toBe('function')
    })
  })
})
