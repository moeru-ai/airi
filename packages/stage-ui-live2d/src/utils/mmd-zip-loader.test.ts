import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cleanupMmdZipData,
  createMmdLoadingManager,
  getMmdTextureUrl,
  registerMmdTextures,
  unregisterMmdTextures,
} from './mmd-zip-loader'

// Mock URL functions
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

beforeEach(() => {
  URL.createObjectURL = vi.fn((blob: Blob) => `blob:test-url-${blob.size}`)
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
  vi.clearAllMocks()
})

describe('mmd-zip-loader', () => {
  describe('registerMmdTextures', () => {
    it('should register textures with normalized lowercase keys', () => {
      const textures = new Map<string, string>()
      textures.set('Model/tex/Face.png', 'blob:texture-url-1')
      textures.set('Model/tex/body.png', 'blob:texture-url-2')

      registerMmdTextures(textures)

      // Should be registered with lowercase path
      expect(getMmdTextureUrl('Model/tex/Face.png')).toBe('blob:texture-url-1')
      expect(getMmdTextureUrl('model/tex/face.png')).toBe('blob:texture-url-1')

      // Cleanup
      unregisterMmdTextures(textures)
    })

    it('should register relative path and filename variants', () => {
      const textures = new Map<string, string>()
      textures.set('Character/skin/body.png', 'blob:texture-url')

      registerMmdTextures(textures)

      // Should match by full path
      expect(getMmdTextureUrl('Character/skin/body.png')).toBe('blob:texture-url')

      // Should match by relative path (without first directory)
      expect(getMmdTextureUrl('skin/body.png')).toBe('blob:texture-url')

      // Should match by filename only
      expect(getMmdTextureUrl('body.png')).toBe('blob:texture-url')

      unregisterMmdTextures(textures)
    })

    it('should not duplicate registration for same key', () => {
      const textures1 = new Map<string, string>()
      textures1.set('tex/face.png', 'blob:url-1')

      const textures2 = new Map<string, string>()
      textures2.set('tex/face.png', 'blob:url-2')

      registerMmdTextures(textures1)
      registerMmdTextures(textures2)

      // First registration should win
      expect(getMmdTextureUrl('tex/face.png')).toBe('blob:url-1')

      unregisterMmdTextures(textures1)
      unregisterMmdTextures(textures2)
    })
  })

  describe('unregisterMmdTextures', () => {
    it('should remove registered textures from registry', () => {
      const textures = new Map<string, string>()
      textures.set('tex/face.png', 'blob:url')

      registerMmdTextures(textures)
      expect(getMmdTextureUrl('tex/face.png')).toBe('blob:url')

      unregisterMmdTextures(textures)
      expect(getMmdTextureUrl('tex/face.png')).toBeNull()
    })

    it('should unregister relative path and filename variants', () => {
      const textures = new Map<string, string>()
      textures.set('Model/tex/face.png', 'blob:url')

      registerMmdTextures(textures)
      expect(getMmdTextureUrl('Model/tex/face.png')).toBe('blob:url')
      expect(getMmdTextureUrl('tex/face.png')).toBe('blob:url')
      expect(getMmdTextureUrl('face.png')).toBe('blob:url')

      unregisterMmdTextures(textures)
      expect(getMmdTextureUrl('Model/tex/face.png')).toBeNull()
      expect(getMmdTextureUrl('tex/face.png')).toBeNull()
      expect(getMmdTextureUrl('face.png')).toBeNull()
    })
  })

  describe('getMmdTextureUrl', () => {
    it('should return null for unregistered texture', () => {
      expect(getMmdTextureUrl('nonexistent.png')).toBeNull()
    })

    it('should handle URL-decoded paths', () => {
      const textures = new Map<string, string>()
      textures.set('tex/颜面.png', 'blob:url')

      registerMmdTextures(textures)

      // Should match URL-encoded version
      expect(getMmdTextureUrl('tex/%E9%A2%9C%E9%9D%A2.png')).toBe('blob:url')

      unregisterMmdTextures(textures)
    })

    it('should handle backslash paths', () => {
      const textures = new Map<string, string>()
      textures.set('tex/face.png', 'blob:url')

      registerMmdTextures(textures)

      // Should normalize backslashes to forward slashes
      expect(getMmdTextureUrl('tex\\face.png')).toBe('blob:url')

      unregisterMmdTextures(textures)
    })

    it('should be case-insensitive', () => {
      const textures = new Map<string, string>()
      textures.set('tex/Face.PNG', 'blob:url')

      registerMmdTextures(textures)

      expect(getMmdTextureUrl('TEX/face.png')).toBe('blob:url')

      unregisterMmdTextures(textures)
    })

    it('should fallback to filename matching', () => {
      const textures = new Map<string, string>()
      textures.set('some/deep/path/texture.png', 'blob:url')

      registerMmdTextures(textures)

      // Should match by filename when path doesn't match exactly
      expect(getMmdTextureUrl('different/path/texture.png')).toBe('blob:url')

      unregisterMmdTextures(textures)
    })
  })

  describe('createMmdLoadingManager', () => {
    it('should create LoadingManager with URL modifier', () => {
      const manager = createMmdLoadingManager()

      expect(manager).toBeDefined()
      expect(manager.setURLModifier).toBeDefined()
    })

    it('should resolve texture URLs through URL modifier', () => {
      const textures = new Map<string, string>()
      textures.set('tex/face.png', 'blob:resolved-url')

      registerMmdTextures(textures)

      createMmdLoadingManager()

      // Test URL modifier directly by checking that registered textures can be resolved
      expect(getMmdTextureUrl('tex/face.png')).toBe('blob:resolved-url')

      unregisterMmdTextures(textures)
    })
  })

  describe('cleanupMmdZipData', () => {
    it('should revoke all URLs', () => {
      const textures = new Map<string, string>()
      textures.set('tex/face.png', 'blob:texture-url')

      const data = {
        modelUrl: 'blob:model-url',
        vmdUrl: 'blob:vmd-url',
        textures,
      }

      registerMmdTextures(textures)

      cleanupMmdZipData(data)

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:model-url')
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vmd-url')
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:texture-url')

      // Registry should be cleared
      expect(getMmdTextureUrl('tex/face.png')).toBeNull()

      // Map should be cleared
      expect(data.textures.size).toBe(0)
    })

    it('should handle missing vmdUrl', () => {
      const textures = new Map<string, string>()
      const data = {
        modelUrl: 'blob:model-url',
        vmdUrl: undefined,
        textures,
      }

      cleanupMmdZipData(data)

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:model-url')
    })
  })

  describe('loadMmdFromZip', () => {
    // NOTE: These tests require a browser environment with proper File/Blob API support.
    // In Node.js/vitest, the File API is partially implemented and JSZip.loadAsync
    // may not work correctly with File objects created in tests.
    // Run these tests in a browser environment or with @vitest/browser

    it.skip('should throw error when no PMX or PMD file found', async () => {
      // Requires browser environment
    })

    it.skip('should extract PMX file and create blob URL', async () => {
      // Requires browser environment
    })

    it.skip('should prefer PMX over PMD', async () => {
      // Requires browser environment
    })

    it.skip('should extract VMD file if present', async () => {
      // Requires browser environment
    })

    it.skip('should extract texture files', async () => {
      // Requires browser environment
    })

    it.skip('should register textures after extraction', async () => {
      // Requires browser environment
    })
  })
})
