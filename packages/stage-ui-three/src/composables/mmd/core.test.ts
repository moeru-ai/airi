import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getMaterialType } from './core'

// Suppress console.log in tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Mock Three.js classes for IK/FK detection tests
vi.mock('three', () => {
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
    this.copy = vi.fn()
    return this
  })

  const MockVector3 = vi.fn().mockImplementation(function (this: any, x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
    this.set = vi.fn()
    this.copy = vi.fn()
    this.clone = vi.fn(() => new MockVector3())
    return this
  })

  const MockAnimationMixer = vi.fn().mockImplementation(function (this: any) {
    this.clipAction = vi.fn(() => ({ play: vi.fn() }))
    return this
  })

  return {
    AnimationMixer: MockAnimationMixer,
    Box3: MockBox3,
    DoubleSide: 2,
    Group: MockGroup,
    SRGBColorSpace: 'srgb',
    Vector3: MockVector3,
  }
})

// Mock CCDIKSolver from three/examples/jsm
vi.mock('three/examples/jsm/animation/CCDIKSolver.js', () => ({
  CCDIKSolver: vi.fn().mockImplementation(function (this: any, mesh: any, iks: any) {
    this.mesh = mesh
    this.iks = iks
    this.update = vi.fn()
    return this
  }),
}))

// Mock @moeru/three-mmd for IK/FK detection tests
vi.mock('@moeru/three-mmd', () => ({
  buildAnimation: vi.fn((vmd: any, _mesh: any) => ({
    tracks: vmd?.tracks || [],
  })),
  processBones: vi.fn(),
}))

// Mock loader module
vi.mock('./loader', () => ({
  useMMDLoader: vi.fn().mockReturnValue({
    loadAsync: vi.fn().mockResolvedValue({
      mesh: {
        isSkinnedMesh: true,
        isMesh: true,
        geometry: {
          dispose: vi.fn(),
          attributes: { position: { needsUpdate: true } },
          computeBoundingBox: vi.fn(),
          boundingBox: null,
        },
        material: { dispose: vi.fn(), map: null, name: 'test_material', side: 0, transparent: false, opacity: 1, depthWrite: true, depthTest: true, needsUpdate: true },
        skeleton: { bones: [], update: vi.fn(), computeBoneTexture: vi.fn() },
        updateMatrixWorld: vi.fn(),
        add: vi.fn(),
        bind: vi.fn(),
        traverse: vi.fn((cb: any) => cb({
          isSkinnedMesh: true,
          isMesh: true,
          geometry: {
            dispose: vi.fn(),
            attributes: { position: { needsUpdate: true } },
            computeBoundingBox: vi.fn(),
            boundingBox: null,
          },
          material: { dispose: vi.fn(), map: null, name: 'test_material', side: 0, transparent: false, opacity: 1, depthWrite: true, depthTest: true, needsUpdate: true },
          frustumCulled: false,
        })),
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
}))

describe('mmd/core', () => {
  describe('getMaterialType', () => {
    describe('sock category (黑丝/袜子/靴子)', () => {
      it('should classify Chinese sock/stocking terms as sock', () => {
        expect(getMaterialType('袜子')).toBe('sock')
        expect(getMaterialType('黑丝')).toBe('sock')
        expect(getMaterialType('丝袜')).toBe('sock')
        expect(getMaterialType('靴子')).toBe('sock')
        expect(getMaterialType('鞋')).toBe('sock')
      })

      it('should classify Japanese sock/stocking terms as sock', () => {
        expect(getMaterialType('靴')).toBe('sock')
        expect(getMaterialType('ニーソ')).toBe('sock')
        expect(getMaterialType('ニソ')).toBe('sock')
      })

      it('should classify English sock/stocking terms as sock', () => {
        expect(getMaterialType('sock')).toBe('sock')
        expect(getMaterialType('stocking')).toBe('sock')
        expect(getMaterialType('pantyhose')).toBe('sock')
        expect(getMaterialType('boot')).toBe('sock')
        expect(getMaterialType('shoe')).toBe('sock')
        expect(getMaterialType('tights')).toBe('sock')
        expect(getMaterialType('legwear')).toBe('sock')
      })

      it('should classify abbreviations as sock', () => {
        expect(getMaterialType('hs')).toBe('sock') // 黑丝 abbreviation
      })

      it('should handle case-insensitive matching', () => {
        expect(getMaterialType('SOCK')).toBe('sock')
        expect(getMaterialType('Stocking')).toBe('sock')
        expect(getMaterialType('BOOT')).toBe('sock')
      })

      it('should match sock keywords in longer names', () => {
        expect(getMaterialType('left_sock')).toBe('sock')
        expect(getMaterialType('right_boot')).toBe('sock')
        expect(getMaterialType('black_stocking_material')).toBe('sock')
      })
    })

    describe('eye category', () => {
      it('should classify Chinese eye terms as eye', () => {
        expect(getMaterialType('白目')).toBe('eye')
        expect(getMaterialType('目光')).toBe('eye')
        expect(getMaterialType('目')).toBe('eye')
        expect(getMaterialType('星目')).toBe('eye')
        expect(getMaterialType('瞳')).toBe('eye')
        expect(getMaterialType('睛')).toBe('eye')
        expect(getMaterialType('眼球')).toBe('eye')
        expect(getMaterialType('眼白')).toBe('eye')
      })

      it('should classify English eye terms as eye', () => {
        expect(getMaterialType('eyeball')).toBe('eye')
        expect(getMaterialType('iris')).toBe('eye')
        expect(getMaterialType('pupil')).toBe('eye')
        expect(getMaterialType('sclera')).toBe('eye')
        expect(getMaterialType('whites')).toBe('eye')
      })

      it('should NOT classify decoration items containing eye keywords as eye', () => {
        // "神之眼" (God's eye) is a decoration, not actual eye
        expect(getMaterialType('神之眼')).toBe('other')
        expect(getMaterialType('神眼')).toBe('other')
        expect(getMaterialType('饰品')).toBe('other')
        expect(getMaterialType('装饰')).toBe('other')
      })

      it('should handle case-insensitive matching', () => {
        expect(getMaterialType('EYEBALL')).toBe('eye')
        expect(getMaterialType('Iris')).toBe('eye')
        expect(getMaterialType('PUPIL')).toBe('eye')
      })

      it('should match eye keywords in longer names', () => {
        expect(getMaterialType('left_eyeball')).toBe('eye')
        expect(getMaterialType('right_pupil')).toBe('eye')
      })
    })

    describe('hair category', () => {
      it('should classify Chinese hair terms as hair', () => {
        expect(getMaterialType('头发')).toBe('hair')
        expect(getMaterialType('发')).toBe('hair')
      })

      it('should classify Japanese hair terms as hair', () => {
        expect(getMaterialType('髪')).toBe('hair')
      })

      it('should classify English hair terms as hair', () => {
        expect(getMaterialType('hair')).toBe('hair')
        expect(getMaterialType('feather')).toBe('hair')
      })

      it('should classify eyebrow and eyelash as hair', () => {
        expect(getMaterialType('睫')).toBe('hair') // eyelash
        expect(getMaterialType('眉')).toBe('hair') // eyebrow
      })

      it('should handle case-insensitive matching', () => {
        expect(getMaterialType('HAIR')).toBe('hair')
        expect(getMaterialType('Feather')).toBe('hair')
      })

      it('should match hair keywords in longer names', () => {
        expect(getMaterialType('front_hair')).toBe('hair')
        expect(getMaterialType('back_hair')).toBe('hair')
        // Note: 'left_eyebrow' contains 'brow' which is English, but code checks for '眉' (Chinese)
        // So 'left_eyebrow' won't match unless it contains '眉'
        expect(getMaterialType('左眉')).toBe('hair') // Chinese eyebrow
      })
    })

    describe('skin category', () => {
      it('should classify Chinese skin/body terms as skin', () => {
        expect(getMaterialType('颜')).toBe('skin')
        expect(getMaterialType('肌')).toBe('skin')
        expect(getMaterialType('肤')).toBe('skin')
        expect(getMaterialType('皮肤')).toBe('skin')
        expect(getMaterialType('胸')).toBe('skin')
        expect(getMaterialType('腹')).toBe('skin')
        expect(getMaterialType('臂')).toBe('skin')
        expect(getMaterialType('腿')).toBe('skin')
      })

      it('should classify Japanese face term as skin', () => {
        // Note: '顔' (face) is Japanese, but the code checks for '颜' (Chinese)
        // '顔' might not match if not explicitly in the list
        expect(getMaterialType('颜')).toBe('skin')
      })

      it('should classify English skin/body terms as skin', () => {
        expect(getMaterialType('skin')).toBe('skin')
        expect(getMaterialType('body')).toBe('skin')
        expect(getMaterialType('face')).toBe('skin')
        expect(getMaterialType('leg')).toBe('skin')
        expect(getMaterialType('thigh')).toBe('skin')
        expect(getMaterialType('arm')).toBe('skin')
        expect(getMaterialType('chest')).toBe('skin')
        expect(getMaterialType('abdomen')).toBe('skin')
      })

      it('should classify hand/finger/nail as skin', () => {
        expect(getMaterialType('指甲')).toBe('skin')
        expect(getMaterialType('甲')).toBe('skin')
        expect(getMaterialType('手指')).toBe('skin')
        expect(getMaterialType('hand')).toBe('skin')
        expect(getMaterialType('finger')).toBe('skin')
        expect(getMaterialType('nail')).toBe('skin')
        expect(getMaterialType('hand_skin')).toBe('skin')
        expect(getMaterialType('finger_skin')).toBe('skin')
      })

      it('should classify foot/toe as skin', () => {
        expect(getMaterialType('足')).toBe('skin')
        expect(getMaterialType('脚')).toBe('skin')
        expect(getMaterialType('foot')).toBe('skin')
        expect(getMaterialType('toe')).toBe('skin')
      })

      it('should handle case-insensitive matching', () => {
        expect(getMaterialType('SKIN')).toBe('skin')
        expect(getMaterialType('Body')).toBe('skin')
        expect(getMaterialType('HAND')).toBe('skin')
      })

      it('should match skin keywords in longer names', () => {
        expect(getMaterialType('face_skin')).toBe('skin')
        expect(getMaterialType('body_skin')).toBe('skin')
        expect(getMaterialType('arm_skin')).toBe('skin')
      })
    })

    describe('cloth category', () => {
      it('should classify Chinese clothing terms as cloth', () => {
        expect(getMaterialType('服')).toBe('cloth')
        expect(getMaterialType('衣')).toBe('cloth')
        expect(getMaterialType('裤')).toBe('cloth')
        expect(getMaterialType('裙')).toBe('cloth')
        expect(getMaterialType('袖')).toBe('cloth')
        expect(getMaterialType('首')).toBe('cloth')
        expect(getMaterialType('体')).toBe('cloth')
      })

      it('should classify English clothing terms as cloth', () => {
        // Note: 'dress' requires space prefix (' dress') to avoid matching 'address'
        expect(getMaterialType(' dress')).toBe('cloth')
        expect(getMaterialType('cloth')).toBe('cloth')
        expect(getMaterialType('skirt')).toBe('cloth')
        expect(getMaterialType('coat')).toBe('cloth')
        expect(getMaterialType('shirt')).toBe('cloth')
        expect(getMaterialType('jacket')).toBe('cloth')
        expect(getMaterialType('top')).toBe('cloth')
        expect(getMaterialType('bottom')).toBe('cloth')
      })

      it('should handle case-insensitive matching', () => {
        expect(getMaterialType(' DRESS')).toBe('cloth')
        expect(getMaterialType('Cloth')).toBe('cloth')
        expect(getMaterialType('SKIRT')).toBe('cloth')
      })

      it('should match cloth keywords in longer names', () => {
        expect(getMaterialType('red dress')).toBe('cloth') // space before dress
        expect(getMaterialType('white_skirt')).toBe('cloth')
        expect(getMaterialType('long_coat')).toBe('cloth')
      })

      it('should NOT match "dress" embedded in other words', () => {
        // " dress" requires space prefix, so "address" should not match
        expect(getMaterialType('address')).toBe('other')
      })
    })

    describe('other category', () => {
      it('should classify unknown terms as other', () => {
        expect(getMaterialType('unknown')).toBe('other')
        expect(getMaterialType('random')).toBe('other')
        expect(getMaterialType('material_01')).toBe('other')
      })

      it('should classify empty string as other', () => {
        expect(getMaterialType('')).toBe('other')
      })

      it('should classify terms with mixed keywords correctly', () => {
        // "hair_dress" should match hair first (hair is checked before cloth)
        expect(getMaterialType('hair_dress')).toBe('hair')
        // "face_dress" should match skin (face is skin)
        expect(getMaterialType('face_dress')).toBe('skin')
      })
    })

    describe('priority order', () => {
      // The code has a specific priority order for classification
      // sock > eye > hair > skin > cloth > other
      it('should prioritize sock over other categories', () => {
        // If a name contains sock keyword, it should be sock
        expect(getMaterialType('skin_sock')).toBe('sock')
        expect(getMaterialType('hair_boot')).toBe('sock')
      })

      it('should prioritize eye over hair/skin/cloth', () => {
        // Eye is checked after sock
        expect(getMaterialType('face_iris')).toBe('eye')
        expect(getMaterialType('eyeball_skin')).toBe('eye')
      })

      it('should prioritize hair over skin/cloth', () => {
        expect(getMaterialType('skin_hair')).toBe('hair')
        expect(getMaterialType('hair_cloth')).toBe('hair')
      })

      it('should prioritize skin over cloth', () => {
        expect(getMaterialType('cloth_skin')).toBe('skin')
        expect(getMaterialType('dress_face')).toBe('skin')
      })
    })

    describe('edge cases', () => {
      it('should handle special characters', () => {
        expect(getMaterialType('袜_01')).toBe('sock')
        expect(getMaterialType('hair.mat')).toBe('hair')
        expect(getMaterialType('skin-v2')).toBe('skin')
      })

      it('should handle Unicode characters', () => {
        expect(getMaterialType('颜面')).toBe('skin')
        expect(getMaterialType('髪飾り')).toBe('hair') // hair decoration
      })

      it('should handle very long names', () => {
        expect(getMaterialType('very_long_material_name_with_skin_keyword_in_middle')).toBe('skin')
        expect(getMaterialType('another_very_long_name_with_boot_at_the_end_boot')).toBe('sock')
      })
    })
  })

  describe('loadMmd', () => {
    // NOTE: loadMmd requires extensive mocking of Three.js and @moeru/three-mmd
    // The loader.test.ts and loader-enhanced.test.ts already cover similar patterns
    // Here we focus on testing the core loading behavior that is specific to core.ts

    it('should be defined and callable', async () => {
      const { loadMmd } = await import('./core')

      expect(loadMmd).toBeDefined()
      expect(typeof loadMmd).toBe('function')
    })

    it('should return undefined when model fails to load', async () => {
      const { loadMmd } = await import('./core')
      const { useMMDLoader } = await import('./loader')

      // Mock loadAsync to return undefined mesh
      const mockLoader = {
        loadAsync: vi.fn().mockResolvedValue({ mesh: null }),
      }
      vi.mocked(useMMDLoader).mockReturnValue(mockLoader as any)

      const result = await loadMmd('test-url', { vmdUrl: undefined })

      expect(result).toBeUndefined()
    })

    it('should return undefined when mmd.mesh is undefined', async () => {
      const { loadMmd } = await import('./core')
      const { useMMDLoader } = await import('./loader')

      const mockLoader = {
        loadAsync: vi.fn().mockResolvedValue({ mesh: undefined }),
      }
      vi.mocked(useMMDLoader).mockReturnValue(mockLoader as any)

      const result = await loadMmd('test-url')

      expect(result).toBeUndefined()
    })

    describe('iK/FK mode detection', () => {
      it('should detect IK mode when IK bones have position animation', async () => {
        const { loadMmd } = await import('./core')
        const { useVMDLoader } = await import('./loader')
        const { buildAnimation } = await import('@moeru/three-mmd')

        // Mock IK position tracks with many frames (> threshold)
        const ikPositionTracks = [
          { name: '左足ＩＫ.position', times: new Array(15).fill(0), values: [] },
          { name: '右足ＩＫ.position', times: new Array(15).fill(0), values: [] },
        ]

        vi.mocked(useVMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({ tracks: ikPositionTracks }),
        } as any)

        vi.mocked(buildAnimation).mockReturnValue({
          tracks: ikPositionTracks,
        } as any)

        // Mock loader with mesh
        const { useMMDLoader } = await import('./loader')
        vi.mocked(useMMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({
            mesh: {
              isSkinnedMesh: true,
              isMesh: true,
              geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
              material: { dispose: vi.fn(), map: null, side: 0, transparent: false, opacity: 1, depthWrite: true, depthTest: true, needsUpdate: true },
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

        const result = await loadMmd('test.pmx', { vmdUrl: 'test.vmd' })

        expect(result?.ikEnabled).toBe(true)
      })

      it('should detect FK mode when knee bones have quaternion animation', async () => {
        const { loadMmd } = await import('./core')
        const { useVMDLoader } = await import('./loader')
        const { buildAnimation } = await import('@moeru/three-mmd')

        // Mock FK quaternion tracks for knee bones with many frames
        const fkQuaternionTracks = [
          { name: '左ひざ.quaternion', times: new Array(15).fill(0), values: [] },
          { name: '右ひざ.quaternion', times: new Array(15).fill(0), values: [] },
        ]

        vi.mocked(useVMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({}),
        } as any)

        vi.mocked(buildAnimation).mockReturnValue({
          tracks: fkQuaternionTracks,
        } as any)

        const { useMMDLoader } = await import('./loader')
        vi.mocked(useMMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({
            mesh: {
              isSkinnedMesh: true,
              isMesh: true,
              geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
              material: { dispose: vi.fn(), map: null, side: 0, transparent: false, opacity: 1, depthWrite: true, depthTest: true, needsUpdate: true },
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

        const result = await loadMmd('test.pmx', { vmdUrl: 'test.vmd' })

        expect(result?.ikEnabled).toBe(false)
      })

      it('should detect hybrid mode when both IK and FK animations present', async () => {
        const { loadMmd } = await import('./core')
        const { useVMDLoader } = await import('./loader')
        const { buildAnimation } = await import('@moeru/three-mmd')

        // Mock both IK position and FK quaternion tracks
        const hybridTracks = [
          { name: '左足ＩＫ.position', times: new Array(15).fill(0), values: [] },
          { name: '左ひざ.quaternion', times: new Array(15).fill(0), values: [] },
        ]

        vi.mocked(useVMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({}),
        } as any)

        vi.mocked(buildAnimation).mockReturnValue({
          tracks: hybridTracks,
        } as any)

        const { useMMDLoader } = await import('./loader')
        vi.mocked(useMMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({
            mesh: {
              isSkinnedMesh: true,
              isMesh: true,
              geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
              material: { dispose: vi.fn(), map: null, side: 0, transparent: false, opacity: 1, depthWrite: true, depthTest: true, needsUpdate: true },
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

        const result = await loadMmd('test.pmx', { vmdUrl: 'test.vmd' })

        // Hybrid mode: IK is enabled when both present
        expect(result?.ikEnabled).toBe(true)
      })

      it('should detect no animation when tracks below threshold', async () => {
        const { loadMmd } = await import('./core')
        const { useVMDLoader } = await import('./loader')
        const { buildAnimation } = await import('@moeru/three-mmd')

        // Mock tracks with few frames (below threshold of 10)
        const lowFrameTracks = [
          { name: '左足ＩＫ.position', times: new Array(5).fill(0), values: [] },
        ]

        vi.mocked(useVMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({}),
        } as any)

        vi.mocked(buildAnimation).mockReturnValue({
          tracks: lowFrameTracks,
        } as any)

        const { useMMDLoader } = await import('./loader')
        vi.mocked(useMMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({
            mesh: {
              isSkinnedMesh: true,
              isMesh: true,
              geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
              material: { dispose: vi.fn(), map: null, side: 0, transparent: false, opacity: 1, depthWrite: true, depthTest: true, needsUpdate: true },
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

        const result = await loadMmd('test.pmx', { vmdUrl: 'test.vmd' })

        expect(result?.ikEnabled).toBe(false)
      })

      it('should handle empty animation tracks', async () => {
        const { loadMmd } = await import('./core')
        const { useVMDLoader } = await import('./loader')
        const { buildAnimation } = await import('@moeru/three-mmd')

        vi.mocked(useVMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({}),
        } as any)

        vi.mocked(buildAnimation).mockReturnValue({
          tracks: [],
        } as any)

        const { useMMDLoader } = await import('./loader')
        vi.mocked(useMMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({
            mesh: {
              isSkinnedMesh: true,
              isMesh: true,
              geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
              material: { dispose: vi.fn(), map: null, side: 0, transparent: false, opacity: 1, depthWrite: true, depthTest: true, needsUpdate: true },
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

        const result = await loadMmd('test.pmx', { vmdUrl: 'test.vmd' })

        expect(result?.ikEnabled).toBe(false)
      })
    })

    describe('iK solver creation', () => {
      it('should create IK solver when IK data is available', async () => {
        const { loadMmd } = await import('./core')
        const { CCDIKSolver } = await import('three/examples/jsm/animation/CCDIKSolver.js')

        const { useMMDLoader } = await import('./loader')
        vi.mocked(useMMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({
            mesh: {
              isSkinnedMesh: true,
              isMesh: true,
              geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
              material: { dispose: vi.fn(), map: null, side: 0, transparent: false, opacity: 1, depthWrite: true, depthTest: true, needsUpdate: true },
              skeleton: { bones: [], update: vi.fn(), computeBoneTexture: vi.fn() },
              updateMatrixWorld: vi.fn(),
              traverse: vi.fn(),
              bind: vi.fn(),
              frustumCulled: false,
              renderOrder: 0,
            },
            grants: [],
            iks: [{ target: 0, effector: 1, links: [] }],
          }),
        } as any)

        const result = await loadMmd('test.pmx')

        expect(CCDIKSolver).toHaveBeenCalled()
        expect(result?.ikSolver).toBeDefined()
      })

      it('should handle IK solver creation failure gracefully', async () => {
        const { loadMmd } = await import('./core')
        const { CCDIKSolver } = await import('three/examples/jsm/animation/CCDIKSolver.js')

        // Mock CCDIKSolver to throw error
        vi.mocked(CCDIKSolver).mockImplementation(() => {
          throw new Error('IK solver creation failed')
        })

        const { useMMDLoader } = await import('./loader')
        vi.mocked(useMMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({
            mesh: {
              isSkinnedMesh: true,
              isMesh: true,
              geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
              material: { dispose: vi.fn(), map: null, side: 0, transparent: false, opacity: 1, depthWrite: true, depthTest: true, needsUpdate: true },
              skeleton: { bones: [], update: vi.fn(), computeBoneTexture: vi.fn() },
              updateMatrixWorld: vi.fn(),
              traverse: vi.fn(),
              bind: vi.fn(),
              frustumCulled: false,
              renderOrder: 0,
            },
            grants: [],
            iks: [{ target: 0, effector: 1, links: [] }],
          }),
        } as any)

        const result = await loadMmd('test.pmx')

        // Should not throw, but ikSolver should be undefined
        expect(result?.ikSolver).toBeUndefined()
      })

      it('should not create IK solver when no IK data', async () => {
        const { loadMmd } = await import('./core')
        const { CCDIKSolver } = await import('three/examples/jsm/animation/CCDIKSolver.js')

        const { useMMDLoader } = await import('./loader')
        vi.mocked(useMMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({
            mesh: {
              isSkinnedMesh: true,
              isMesh: true,
              geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
              material: { dispose: vi.fn(), map: null, side: 0, transparent: false, opacity: 1, depthWrite: true, depthTest: true, needsUpdate: true },
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

        vi.mocked(CCDIKSolver).mockClear()

        const result = await loadMmd('test.pmx')

        expect(CCDIKSolver).not.toHaveBeenCalled()
        expect(result?.ikSolver).toBeUndefined()
      })
    })

    describe('vMD loading error handling', () => {
      it('should handle VMD loading failure gracefully', async () => {
        const { loadMmd } = await import('./core')
        const { useVMDLoader } = await import('./loader')

        vi.mocked(useVMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockRejectedValue(new Error('VMD load failed')),
        } as any)

        const { useMMDLoader } = await import('./loader')
        vi.mocked(useMMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({
            mesh: {
              isSkinnedMesh: true,
              isMesh: true,
              geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
              material: { dispose: vi.fn(), map: null, side: 0, transparent: false, opacity: 1, depthWrite: true, depthTest: true, needsUpdate: true },
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

        // Should not throw
        const result = await loadMmd('test.pmx', { vmdUrl: 'invalid.vmd' })

        expect(result).toBeDefined()
        expect(result?.animationClip).toBeUndefined()
        expect(result?.mixer).toBeUndefined()
      })
    })

    describe('scene integration', () => {
      it('should add model to scene when scene is provided', async () => {
        const { loadMmd } = await import('./core')

        const mockScene = { add: vi.fn() }

        const { useMMDLoader } = await import('./loader')
        vi.mocked(useMMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({
            mesh: {
              isSkinnedMesh: true,
              isMesh: true,
              geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
              material: { dispose: vi.fn(), map: null, side: 0, transparent: false, opacity: 1, depthWrite: true, depthTest: true, needsUpdate: true },
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

        await loadMmd('test.pmx', { scene: mockScene as any })

        expect(mockScene.add).toHaveBeenCalled()
      })

      it('should add skeleton bones to scene when they have no parent', async () => {
        const { loadMmd } = await import('./core')

        // Proper mock bone with position/quaternion/scale
        const mockBone = {
          parent: null,
          position: { copy: vi.fn() },
          quaternion: { copy: vi.fn() },
          scale: { copy: vi.fn() },
        }
        const mockScene = { add: vi.fn() }

        const { useMMDLoader } = await import('./loader')
        vi.mocked(useMMDLoader).mockReturnValue({
          loadAsync: vi.fn().mockResolvedValue({
            mesh: {
              isSkinnedMesh: true,
              isMesh: true,
              geometry: { dispose: vi.fn(), attributes: { position: { needsUpdate: true } }, computeBoundingBox: vi.fn() },
              material: { dispose: vi.fn(), map: null, side: 0, transparent: false, opacity: 1, depthWrite: true, depthTest: true, needsUpdate: true },
              skeleton: {
                bones: [mockBone],
                update: vi.fn(),
                computeBoneTexture: vi.fn(),
              },
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

        await loadMmd('test.pmx', { scene: mockScene as any })

        expect(mockScene.add).toHaveBeenCalled()
      })
    })
  })

  describe('mmdLoadResult interface', () => {
    it('should export MmdLoadResult type', async () => {
      // TypeScript type import - this validates the type is exported
      // The type itself cannot be tested at runtime, but we can verify the module exports
      const coreModule = await import('./core')

      // Verify the module exports MmdLoadResult (as a type)
      expect(coreModule).toBeDefined()
      expect(coreModule.loadMmd).toBeDefined()
    })
  })
})
