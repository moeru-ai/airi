import { createPinia, setActivePinia } from 'pinia'
import { Raycaster, Vector3 } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@vueuse/core', async () => {
  const vue = await import('vue')
  return {
    useBroadcastChannel: vi.fn(() => ({
      data: vue.ref(null),
      post: vi.fn(),
    })),
  }
})

vi.mock('../stores/camera', async () => {
  const vue = await import('vue')
  return {
    DEFAULT_CAMERA_DISTANCE: 1,
    DEFAULT_CAMERA_FOV: 40,
    DEFAULT_CAMERA_POSITION: { x: 0, y: 0, z: -1 },
    useThreeCamera: vi.fn(() => ({
      cameraDistance: vue.ref(1),
      cameraFOV: vue.ref(40),
      cameraPosition: vue.ref({ x: 0, y: 0, z: -1 }),
    })),
  }
})

describe('useVRMEyeFocusFor', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    setActivePinia(createPinia())
  })

  /**
   * @example
   * expect(focus.value).toBe(defaultLookAt)
   */
  it('returns the default target when mouse mode has no tracking source', async () => {
    const { useVRMEyeFocusFor } = await import('./eye-tracking')
    const defaultLookAt = new Vector3(1, 2, 3)

    const focus = useVRMEyeFocusFor({
      cameraPosition: () => ({ x: 0, y: 0, z: -1 }),
      context: () => ({
        camera: {
          near: 0.1,
        } as any,
        defaultLookAt,
        raycaster: new Raycaster(),
      }),
      screenBoundingBox: () => ({ height: 100, left: 0, top: 0, width: 100 }),
      source: () => null,
      trackingMode: () => 'mouse',
    })

    expect(focus.value).toBe(defaultLookAt)
  })

  /**
   * @example
   * expect(raycaster.setFromCamera).toHaveBeenCalled()
   */
  it('uses the plain tracking source when mouse tracking is active', async () => {
    const { useVRMEyeFocusFor } = await import('./eye-tracking')

    const raycaster = {
      ray: {
        direction: new Vector3(0, 0, -1),
        origin: new Vector3(0, 0, 0),
      },
      setFromCamera: vi.fn(),
    }
    const focus = useVRMEyeFocusFor({
      cameraPosition: () => ({ x: 0, y: 0, z: -1 }),
      context: () => ({
        camera: {
          near: 0.1,
        } as any,
        defaultLookAt: new Vector3(1, 2, 3),
        raycaster: raycaster as unknown as Raycaster,
      }),
      screenBoundingBox: () => ({ height: 100, left: 0, top: 0, width: 100 }),
      source: () => ({ x: 50, y: 50 }),
      trackingMode: () => 'mouse',
    })

    expect(focus.value).toEqual(new Vector3(0, 0, -0.8))
    expect(raycaster.setFromCamera).toHaveBeenCalled()
  })
})
