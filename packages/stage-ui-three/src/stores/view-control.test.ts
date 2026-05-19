import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultControlConfig, formatter, supportedControl, useThreeViewControl } from './view-control'

vi.mock('./camera', async () => {
  const vue = await import('vue')
  return {
    DEFAULT_CAMERA_DISTANCE: 20,
    DEFAULT_CAMERA_FOV: 40,
    useThreeCamera: vi.fn(() => ({
      cameraDistance: vue.ref(20),
      cameraFOV: vue.ref(40),
    })),
  }
})

vi.mock('@vueuse/core', async () => {
  const vue = await import('vue')
  return {
    useLocalStorage: vi.fn((_key, initialValue) => vue.ref(initialValue)),
  }
})

describe('useThreeViewControl', () => {
  let composable: ReturnType<typeof useThreeViewControl>

  beforeEach(() => {
    composable = useThreeViewControl()
  })

  it('should initialize with defaults', () => {
    expect(composable.viewControlsEnabled.value).toBe(false)
    expect(composable.viewControlMode.value).toBe('cameraDistance')
    expect(composable.modelOffset.value).toEqual({ x: 0, y: 0, z: 0 })
    expect(composable.cameraDistance.value).toBe(20)
    expect(composable.cameraFOV.value).toBe(40)
  })

  describe('set function', () => {
    it('should set model offset x', () => {
      composable.set('x', 5)
      expect(composable.modelOffset.value.x).toBe(5)
    })

    it('should set camera distance', () => {
      composable.set('cameraDistance', 8)
      expect(composable.cameraDistance.value).toBe(8)
    })

    it('should set camera FOV', () => {
      composable.set('cameraFOV', 60)
      expect(composable.cameraFOV.value).toBe(60)
    })

    it('should clamp values to max', () => {
      supportedControl.forEach(key => composable.set(key, Number.MAX_VALUE))
      expect(composable.modelOffset.value.x).toBe(defaultControlConfig.x.max)
      expect(composable.modelOffset.value.y).toBe(defaultControlConfig.y.max)
      expect(composable.modelOffset.value.z).toBe(defaultControlConfig.z.max)
      expect(composable.cameraDistance.value).toBe(defaultControlConfig.cameraDistance.max)
      expect(composable.cameraFOV.value).toBe(defaultControlConfig.cameraFOV.max)
    })

    it('should clamp values to min', () => {
      supportedControl.forEach(key => composable.set(key, -Number.MAX_VALUE))
      expect(composable.modelOffset.value.x).toBe(defaultControlConfig.x.min)
      expect(composable.modelOffset.value.y).toBe(defaultControlConfig.y.min)
      expect(composable.modelOffset.value.z).toBe(defaultControlConfig.z.min)
      expect(composable.cameraDistance.value).toBe(defaultControlConfig.cameraDistance.min)
      expect(composable.cameraFOV.value).toBe(defaultControlConfig.cameraFOV.min)
    })

    it('should reset to default when value is omitted', () => {
      supportedControl.forEach(k => composable.set(k, defaultControlConfig[k].default + 1))
      supportedControl.forEach(k => composable.set(k))
      expect(composable.modelOffset.value.x).toBe(defaultControlConfig.x.default)
      expect(composable.modelOffset.value.y).toBe(defaultControlConfig.y.default)
      expect(composable.modelOffset.value.z).toBe(defaultControlConfig.z.default)
      expect(composable.cameraDistance.value).toBe(defaultControlConfig.cameraDistance.default)
      expect(composable.cameraFOV.value).toBe(defaultControlConfig.cameraFOV.default)
    })
  })

  describe('formatter', () => {
    it('should format meters with 2 decimals', () => {
      expect(formatter.x(1.234)).toBe('1.23m')
      expect(formatter.x(1.236)).toBe('1.24m')
      expect(formatter.y(10)).toBe('10.00m')
    })

    it('should format camera FOV with 0 decimal', () => {
      expect(formatter.cameraFOV(45.4)).toBe('45°')
      expect(formatter.cameraFOV(45.5)).toBe('46°')
      expect(formatter.cameraFOV(90)).toBe('90°')
    })
  })
})
