import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultControlConfig, formatter, supportedControl, useL2dViewControl } from './view-control'

vi.mock('@vueuse/core', async () => {
  const vue = await import('vue')
  return {
    useLocalStorage: vi.fn((_key, initialValue) => vue.ref(initialValue)),
  }
})

describe('useL2dViewControl', () => {
  let composable: ReturnType<typeof useL2dViewControl>

  beforeEach(() => {
    composable = useL2dViewControl()
  })

  it('should initialize with defaults', () => {
    expect(composable.viewControlsEnabled.value).toBe(false)
    expect(composable.viewControlMode.value).toBe('scale')
    expect(composable.position.value).toEqual({ x: 0, y: 0 })
    expect(composable.scale.value).toBe(1)
  })

  describe('set function', () => {
    it('should set model position x', () => {
      composable.set('x', 5)
      expect(composable.position.value.x).toBe(5)
    })

    it('should set scale', () => {
      composable.set('scale', 2)
      expect(composable.scale.value).toBe(2)
    })

    it('should clamp values to max', () => {
      supportedControl.forEach(key => composable.set(key, Number.MAX_VALUE))
      expect(composable.position.value.x).toBe(defaultControlConfig.x.max)
      expect(composable.position.value.y).toBe(defaultControlConfig.y.max)
      expect(composable.scale.value).toBe(defaultControlConfig.scale.max)
    })

    it('should clamp values to min', () => {
      supportedControl.forEach(key => composable.set(key, -Number.MAX_VALUE))
      expect(composable.position.value.x).toBe(defaultControlConfig.x.min)
      expect(composable.position.value.y).toBe(defaultControlConfig.y.min)
      expect(composable.scale.value).toBe(defaultControlConfig.scale.min)
    })

    it('should reset to default when value is omitted', () => {
      supportedControl.forEach(k => composable.set(k, defaultControlConfig[k].default + 1))
      supportedControl.forEach(k => composable.set(k))
      expect(composable.position.value.x).toBe(defaultControlConfig.x.default)
      expect(composable.position.value.y).toBe(defaultControlConfig.y.default)
      expect(composable.scale.value).toBe(defaultControlConfig.scale.default)
    })
  })

  describe('formatter', () => {
    it('should format percentages with 1 decimals', () => {
      expect(formatter.x(123.44)).toBe('123.4%')
      expect(formatter.x(123.56)).toBe('123.6%')
      expect(formatter.y(11.22)).toBe('11.2%')
    })

    it('should format to percentage with 0 decimal', () => {
      expect(formatter.scale(1.234)).toBe('123%')
      expect(formatter.scale(1.236)).toBe('124%')
      expect(formatter.scale(0.11)).toBe('11%')
    })
  })
})
