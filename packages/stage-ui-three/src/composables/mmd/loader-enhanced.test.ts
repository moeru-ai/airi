import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Three.js classes
vi.mock('three', () => {
  const mockGeometry = {
    dispose: vi.fn(),
    computeBoundingBox: vi.fn(),
    boundingBox: null,
    attributes: { position: { needsUpdate: true } },
  }

  const mockMaterial = {
    dispose: vi.fn(),
    side: 0,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    needsUpdate: true,
    map: null,
  }

  const mockSkeleton = {
    bones: [],
    update: vi.fn(),
    computeBoneTexture: vi.fn(),
  }

  const mockMesh = {
    isMesh: true,
    isSkinnedMesh: true,
    geometry: mockGeometry,
    material: mockMaterial,
    skeleton: mockSkeleton,
    frustumCulled: false,
    renderOrder: 0,
    updateMatrixWorld: vi.fn(),
    add: vi.fn(),
    bind: vi.fn(),
    traverse: vi.fn((cb: any) => cb(mockMesh)),
    castShadow: false,
    receiveShadow: false,
  }

  // Proper constructor functions
  const MockGroup = vi.fn().mockImplementation(function (this: any) {
    this.add = vi.fn()
    this.frustumCulled = false
    this.parent = null
    return this
  })

  const MockBox3 = vi.fn().mockImplementation(function (this: any) {
    this.union = vi.fn()
    this.getSize = vi.fn((v: any) => { v.set(1, 2, 1) })
    this.getCenter = vi.fn((v: any) => { v.set(0, 1, 0) })
    this.copy = vi.fn(() => this)
    this.applyMatrix4 = vi.fn(() => this)
    return this
  })

  const MockVector3 = vi.fn().mockImplementation(function (this: any, x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
    this.set = vi.fn((nx: number, ny: number, nz: number) => {
      this.x = nx
      this.y = ny
      this.z = nz
    })
    this.copy = vi.fn()
    this.clone = vi.fn(() => new MockVector3())
    return this
  })

  const MockBufferGeometry = vi.fn().mockImplementation(function (this: any) {
    this.setAttribute = vi.fn((name: string, attr: any) => {
      this.attributes[name] = attr
    })
    this.setIndex = vi.fn()
    this.computeBoundingBox = vi.fn()
    this.dispose = vi.fn()
    this.attributes = {
      position: { needsUpdate: true },
      skinIndex: {},
      skinWeight: {},
    }
    this.boundingBox = null
    return this
  })

  const MockMeshToonMaterial = vi.fn().mockImplementation(function (this: any, options: any) {
    this.color = options?.color
    this.side = options?.side
    this.dispose = vi.fn()
    this.needsUpdate = true
    return this
  })

  const MockBone = vi.fn().mockImplementation(function (this: any) {
    this.name = ''
    this.position = { set: vi.fn((_x: number, _y: number, _z: number) => {}) }
    this.quaternion = {}
    this.scale = {}
    this.add = vi.fn()
    this.parent = null
    return this
  })

  const MockSkeleton = vi.fn().mockImplementation(function (this: any, bones: any) {
    this.bones = bones
    this.update = vi.fn()
    this.computeBoneTexture = vi.fn()
    return this
  })

  const MockSkinnedMesh = vi.fn().mockImplementation(function (this: any, geometry: any, material: any) {
    this.isSkinnedMesh = true
    this.isMesh = true
    this.geometry = geometry || {
      dispose: vi.fn(),
      computeBoundingBox: vi.fn(),
      boundingBox: null,
      attributes: {
        position: { needsUpdate: true },
        skinIndex: {},
        skinWeight: {},
      },
    }
    this.material = material
    this.add = vi.fn()
    this.bind = vi.fn()
    this.castShadow = false
    this.receiveShadow = false
    this.frustumCulled = false
    this.renderOrder = 0
    this.updateMatrixWorld = vi.fn()
    this.traverse = vi.fn((cb: any) => cb(this))
    this.skeleton = null
    this.visible = true
    return this
  })

  const MockTextureLoader = vi.fn().mockImplementation(function (this: any) {
    this.load = vi.fn()
    return this
  })

  const MockAnimationMixer = vi.fn().mockImplementation(function (this: any) {
    this.clipAction = vi.fn(() => ({ play: vi.fn() }))
    this.stopAllAction = vi.fn()
    this.uncacheRoot = vi.fn()
    this.getRoot = vi.fn()
    return this
  })

  const MockFloat32BufferAttribute = vi.fn().mockImplementation(function (this: any, array: any, size: any) {
    this.array = array
    this.size = size
    return this
  })

  const MockUint16BufferAttribute = vi.fn().mockImplementation(function (this: any, array: any, size: any) {
    this.array = array
    this.size = size
    return this
  })

  return {
    AnimationMixer: MockAnimationMixer,
    Bone: MockBone,
    Box3: MockBox3,
    BufferGeometry: MockBufferGeometry,
    DoubleSide: 2,
    Float32BufferAttribute: MockFloat32BufferAttribute,
    Group: MockGroup,
    MeshToonMaterial: MockMeshToonMaterial,
    Skeleton: MockSkeleton,
    SkinnedMesh: MockSkinnedMesh,
    SRGBColorSpace: 'srgb',
    TextureLoader: MockTextureLoader,
    Uint16BufferAttribute: MockUint16BufferAttribute,
    Vector3: MockVector3,
  }
})

// Mock @moeru/three-mmd
vi.mock('@moeru/three-mmd', () => ({
  buildAnimation: vi.fn(() => ({ tracks: [] })),
  processBones: vi.fn(),
}))

// Mock loader module
vi.mock('./loader', () => ({
  useMMDLoader: vi.fn().mockReturnValue({
    loadAsync: vi.fn().mockResolvedValue({
      mesh: {
        isSkinnedMesh: true,
        geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } } },
        material: { dispose: vi.fn(), map: null },
        skeleton: { bones: [], update: vi.fn(), computeBoneTexture: vi.fn() },
        updateMatrixWorld: vi.fn(),
        traverse: vi.fn(),
        frustumCulled: false,
        renderOrder: 0,
      },
      grants: [],
      iks: [],
    }),
  }),
  useVMDLoader: vi.fn().mockReturnValue({
    loadAsync: vi.fn().mockResolvedValue({}),
  }),
  registerMmdTextures: vi.fn(),
  unregisterMmdTextures: vi.fn(),
}))

describe('mmd/loader-enhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('cache operations', () => {
    it('should start with empty cache', async () => {
      const { getMmdCacheSize, clearMmdCache } = await import('./loader-enhanced')

      clearMmdCache()
      expect(getMmdCacheSize()).toBe(0)
    })

    it('should clear all cache when no URL provided', async () => {
      const { clearMmdCache, getMmdCacheSize } = await import('./loader-enhanced')

      clearMmdCache()
      expect(getMmdCacheSize()).toBe(0)
    })

    it('isMmdCached should return false for uncached URL', async () => {
      const { isMmdCached, clearMmdCache } = await import('./loader-enhanced')

      clearMmdCache()
      expect(isMmdCached('nonexistent-url')).toBe(false)
    })

    it('getCachedMmd should return undefined for uncached URL', async () => {
      const { getCachedMmd, clearMmdCache } = await import('./loader-enhanced')

      clearMmdCache()
      expect(getCachedMmd('nonexistent-url')).toBeUndefined()
    })
  })

  describe('clearMmdCache', () => {
    it('should handle clearing all cache safely', async () => {
      const { clearMmdCache, getMmdCacheSize } = await import('./loader-enhanced')

      clearMmdCache()
      expect(getMmdCacheSize()).toBe(0)
    })
  })

  describe('disposeMmdResult', () => {
    it('should dispose mixer and animation resources', async () => {
      const { disposeMmdResult } = await import('./loader-enhanced')

      const mockMixer = {
        stopAllAction: vi.fn(),
        uncacheRoot: vi.fn(),
        getRoot: vi.fn(),
      }

      const result = {
        mmd: { mesh: {} } as any,
        mesh: {
          geometry: { dispose: vi.fn() },
          traverse: vi.fn(),
          material: { dispose: vi.fn(), map: null },
        } as any,
        mmdGroup: { parent: null } as any,
        modelCenter: {} as any,
        modelSize: {} as any,
        initialCameraOffset: {} as any,
        mixer: mockMixer as any,
      }

      disposeMmdResult(result)

      expect(mockMixer.stopAllAction).toHaveBeenCalled()
      expect(mockMixer.uncacheRoot).toHaveBeenCalled()
    })

    it('should dispose mesh geometry and materials', async () => {
      const { disposeMmdResult } = await import('./loader-enhanced')

      const mockGeometry = { dispose: vi.fn() }
      const mockMaterial = { dispose: vi.fn(), map: null }

      const result = {
        mmd: { mesh: {} } as any,
        mesh: {
          geometry: mockGeometry,
          material: mockMaterial,
          traverse: vi.fn((cb: any) => {
            cb({
              isMesh: true,
              geometry: mockGeometry,
              material: mockMaterial,
            })
          }),
        } as any,
        mmdGroup: { parent: null } as any,
        modelCenter: {} as any,
        modelSize: {} as any,
        initialCameraOffset: {} as any,
      }

      disposeMmdResult(result)

      expect(mockGeometry.dispose).toHaveBeenCalled()
      expect(mockMaterial.dispose).toHaveBeenCalled()
    })

    it('should remove mmdGroup from parent', async () => {
      const { disposeMmdResult } = await import('./loader-enhanced')

      const mockParent = { remove: vi.fn() }
      const result = {
        mmd: { mesh: {} } as any,
        mesh: {
          geometry: { dispose: vi.fn() },
          traverse: vi.fn(),
          material: { dispose: vi.fn(), map: null },
        } as any,
        mmdGroup: { parent: mockParent } as any,
        modelCenter: {} as any,
        modelSize: {} as any,
        initialCameraOffset: {} as any,
      }

      disposeMmdResult(result)

      expect(mockParent.remove).toHaveBeenCalledWith(result.mmdGroup)
    })

    it('should handle missing optional properties', async () => {
      const { disposeMmdResult } = await import('./loader-enhanced')

      const result = {
        mmd: { mesh: {} } as any,
        mesh: {
          geometry: { dispose: vi.fn() },
          traverse: vi.fn(),
          material: { dispose: vi.fn(), map: null },
        } as any,
        mmdGroup: { parent: null } as any,
        modelCenter: {} as any,
        modelSize: {} as any,
        initialCameraOffset: {} as any,
        // No mixer, no animationClip
      }

      // Should not throw
      expect(() => disposeMmdResult(result)).not.toThrow()
    })
  })

  describe('loadMmdTexture', () => {
    it('should be defined and callable', async () => {
      const { loadMmdTexture } = await import('./loader-enhanced')

      expect(loadMmdTexture).toBeDefined()
      expect(typeof loadMmdTexture).toBe('function')
    })
  })

  describe('loadMmd', () => {
    it('should be defined and callable', async () => {
      const { loadMmd } = await import('./loader-enhanced')

      expect(loadMmd).toBeDefined()
      expect(typeof loadMmd).toBe('function')
    })

    it('should return undefined when model fails to load and usePlaceholder is false', async () => {
      const { loadMmd } = await import('./loader-enhanced')
      const { useMMDLoader } = await import('./loader')

      // Mock loadAsync to return undefined
      const mockLoader = {
        loadAsync: vi.fn().mockResolvedValue({ mesh: null }),
      }
      vi.mocked(useMMDLoader).mockReturnValue(mockLoader as any)

      const result = await loadMmd('test-url', { usePlaceholder: false, useCache: false })

      expect(result).toBeUndefined()
    })

    it('should create placeholder model when model fails and usePlaceholder is true', async () => {
      const { loadMmd } = await import('./loader-enhanced')
      const { useMMDLoader } = await import('./loader')

      // Mock loadAsync to return undefined mesh
      vi.mocked(useMMDLoader).mockReturnValue({
        loadAsync: vi.fn().mockResolvedValue({ mesh: null }),
      } as any)

      const result = await loadMmd('test-url', { usePlaceholder: true, useCache: false })

      // Placeholder model should be created
      expect(result).toBeDefined()
      expect(result?.mesh).toBeDefined()
      expect(result?.mmdGroup).toBeDefined()
    })

    it('should cache model data when useCache is true', async () => {
      const { loadMmd, isMmdCached, clearMmdCache } = await import('./loader-enhanced')
      const { useMMDLoader } = await import('./loader')

      clearMmdCache()

      vi.mocked(useMMDLoader).mockReturnValue({
        loadAsync: vi.fn().mockResolvedValue({
          mesh: {
            isSkinnedMesh: true,
            isMesh: true,
            geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
            material: { dispose: vi.fn(), map: null },
            skeleton: { bones: [], update: vi.fn(), computeBoneTexture: vi.fn() },
            updateMatrixWorld: vi.fn(),
            traverse: vi.fn(),
            bind: vi.fn(),
            frustumCulled: false,
            renderOrder: 0,
          },
          grants: [],
          iks: [],
        }),
      } as any)

      await loadMmd('test-cache-url', { useCache: true })

      expect(isMmdCached('test-cache-url')).toBe(true)
    })

    it('should not cache model data when useCache is false', async () => {
      const { loadMmd, isMmdCached, clearMmdCache } = await import('./loader-enhanced')
      const { useMMDLoader } = await import('./loader')

      clearMmdCache()

      vi.mocked(useMMDLoader).mockReturnValue({
        loadAsync: vi.fn().mockResolvedValue({
          mesh: {
            isSkinnedMesh: true,
            isMesh: true,
            geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
            material: { dispose: vi.fn(), map: null },
            skeleton: { bones: [], update: vi.fn(), computeBoneTexture: vi.fn() },
            updateMatrixWorld: vi.fn(),
            traverse: vi.fn(),
            bind: vi.fn(),
            frustumCulled: false,
            renderOrder: 0,
          },
          grants: [],
          iks: [],
        }),
      } as any)

      await loadMmd('test-no-cache-url', { useCache: false })

      expect(isMmdCached('test-no-cache-url')).toBe(false)
    })

    it('should compute model metrics correctly', async () => {
      const { loadMmd, clearMmdCache } = await import('./loader-enhanced')
      const { useMMDLoader } = await import('./loader')

      clearMmdCache()

      vi.mocked(useMMDLoader).mockReturnValue({
        loadAsync: vi.fn().mockResolvedValue({
          mesh: {
            isSkinnedMesh: true,
            isMesh: true,
            geometry: {
              dispose: vi.fn(),
              attributes: { position: { needsUpdate: true } },
              computeBoundingBox: vi.fn(),
              boundingBox: { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } },
            },
            material: { dispose: vi.fn(), map: null },
            skeleton: { bones: [], update: vi.fn(), computeBoneTexture: vi.fn() },
            updateMatrixWorld: vi.fn(),
            traverse: vi.fn(),
            bind: vi.fn(),
            frustumCulled: false,
            renderOrder: 0,
            visible: true,
          },
          grants: [],
          iks: [],
        }),
      } as any)

      const result = await loadMmd('test-metrics-url', { useCache: false })

      expect(result).toBeDefined()
      expect(result?.modelCenter).toBeDefined()
      expect(result?.modelSize).toBeDefined()
      expect(result?.initialCameraOffset).toBeDefined()
    })

    it('should register textures when textures option is provided', async () => {
      const { loadMmd, clearMmdCache } = await import('./loader-enhanced')
      const { useMMDLoader, registerMmdTextures, unregisterMmdTextures } = await import('./loader')

      clearMmdCache()

      vi.mocked(useMMDLoader).mockReturnValue({
        loadAsync: vi.fn().mockResolvedValue({
          mesh: {
            isSkinnedMesh: true,
            isMesh: true,
            geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
            material: { dispose: vi.fn(), map: null },
            skeleton: { bones: [], update: vi.fn(), computeBoneTexture: vi.fn() },
            updateMatrixWorld: vi.fn(),
            traverse: vi.fn(),
            bind: vi.fn(),
            frustumCulled: false,
            renderOrder: 0,
          },
          grants: [],
          iks: [],
        }),
      } as any)

      const textures = new Map<string, string>()
      textures.set('texture1.png', 'blob:uuid-1')

      await loadMmd('test-texture-url', { textures, useCache: false })

      expect(registerMmdTextures).toHaveBeenCalledWith(textures)
      expect(unregisterMmdTextures).toHaveBeenCalledWith(textures)
    })

    it('should add model to scene when scene is provided', async () => {
      const { loadMmd, clearMmdCache } = await import('./loader-enhanced')
      const { useMMDLoader } = await import('./loader')

      clearMmdCache()

      const mockScene = { add: vi.fn() }

      vi.mocked(useMMDLoader).mockReturnValue({
        loadAsync: vi.fn().mockResolvedValue({
          mesh: {
            isSkinnedMesh: true,
            isMesh: true,
            geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
            material: { dispose: vi.fn(), map: null },
            skeleton: { bones: [], update: vi.fn(), computeBoneTexture: vi.fn() },
            updateMatrixWorld: vi.fn(),
            traverse: vi.fn(),
            bind: vi.fn(),
            frustumCulled: false,
            renderOrder: 0,
          },
          grants: [],
          iks: [],
        }),
      } as any)

      await loadMmd('test-scene-url', { scene: mockScene as any, useCache: false })

      expect(mockScene.add).toHaveBeenCalled()
    })

    it('should load VMD animation when vmdUrl is provided', async () => {
      const { loadMmd, clearMmdCache } = await import('./loader-enhanced')
      const { useMMDLoader, useVMDLoader } = await import('./loader')

      clearMmdCache()

      vi.mocked(useMMDLoader).mockReturnValue({
        loadAsync: vi.fn().mockResolvedValue({
          mesh: {
            isSkinnedMesh: true,
            isMesh: true,
            geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
            material: { dispose: vi.fn(), map: null },
            skeleton: { bones: [], update: vi.fn(), computeBoneTexture: vi.fn() },
            updateMatrixWorld: vi.fn(),
            traverse: vi.fn(),
            bind: vi.fn(),
            frustumCulled: false,
            renderOrder: 0,
          },
          grants: [],
          iks: [],
        }),
      } as any)

      vi.mocked(useVMDLoader).mockReturnValue({
        loadAsync: vi.fn().mockResolvedValue({}),
      } as any)

      const result = await loadMmd('test-vmd-url', { vmdUrl: 'test.vmd', useCache: false })

      expect(result?.mixer).toBeDefined()
      expect(result?.animationClip).toBeDefined()
    })

    it('should handle VMD loading failure gracefully', async () => {
      const { loadMmd, clearMmdCache } = await import('./loader-enhanced')
      const { useMMDLoader, useVMDLoader } = await import('./loader')

      clearMmdCache()

      vi.mocked(useMMDLoader).mockReturnValue({
        loadAsync: vi.fn().mockResolvedValue({
          mesh: {
            isSkinnedMesh: true,
            isMesh: true,
            geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
            material: { dispose: vi.fn(), map: null },
            skeleton: { bones: [], update: vi.fn(), computeBoneTexture: vi.fn() },
            updateMatrixWorld: vi.fn(),
            traverse: vi.fn(),
            bind: vi.fn(),
            frustumCulled: false,
            renderOrder: 0,
          },
          grants: [],
          iks: [],
        }),
      } as any)

      vi.mocked(useVMDLoader).mockReturnValue({
        loadAsync: vi.fn().mockRejectedValue(new Error('VMD load failed')),
      } as any)

      const result = await loadMmd('test-vmd-error-url', { vmdUrl: 'invalid.vmd', useCache: false })

      // Should not throw, animationClip and mixer should be undefined
      expect(result).toBeDefined()
      expect(result?.animationClip).toBeUndefined()
      expect(result?.mixer).toBeUndefined()
    })

    it('should call onProgress callback during loading', async () => {
      const { loadMmd, clearMmdCache } = await import('./loader-enhanced')
      const { useMMDLoader } = await import('./loader')

      clearMmdCache()

      const onProgress = vi.fn()

      vi.mocked(useMMDLoader).mockReturnValue({
        loadAsync: vi.fn().mockImplementation(async (url: string, progressCb: any) => {
          // Simulate progress callback
          if (progressCb) {
            progressCb({ loaded: 50, total: 100 })
          }
          return {
            mesh: {
              isSkinnedMesh: true,
              isMesh: true,
              geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
              material: { dispose: vi.fn(), map: null },
              skeleton: { bones: [], update: vi.fn(), computeBoneTexture: vi.fn() },
              updateMatrixWorld: vi.fn(),
              traverse: vi.fn(),
              bind: vi.fn(),
              frustumCulled: false,
              renderOrder: 0,
            },
            grants: [],
            iks: [],
          }
        }),
      } as any)

      await loadMmd('test-progress-url', { onProgress, useCache: false })

      expect(onProgress).toHaveBeenCalled()
    })
  })
})
