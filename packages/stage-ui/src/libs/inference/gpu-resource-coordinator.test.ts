import { describe, expect, it, vi } from 'vitest'

import { createGPUResourceCoordinator } from './gpu-resource-coordinator'

describe('gpuResourceCoordinator', () => {
  // 1 GB VRAM budget (budget = 1GB * 0.70 = 716.8 MB)
  const VRAM = 1024 * 1024 * 1024

  it('should track allocations and report usage', () => {
    const coordinator = createGPUResourceCoordinator(VRAM)

    const token = coordinator.requestAllocation('model-a', 200 * 1024 * 1024)

    const usage = coordinator.getUsage()
    expect(usage.allocated).toBe(200 * 1024 * 1024)
    expect(usage.models).toContain('model-a')
    expect(usage.budget).toBeGreaterThan(0)

    coordinator.release(token)
    expect(coordinator.getUsage().allocated).toBe(0)
    expect(coordinator.getUsage().models).toEqual([])
  })

  it('should emit warning when allocation exceeds 80% of budget', () => {
    const coordinator = createGPUResourceCoordinator(VRAM)
    const handler = vi.fn()
    coordinator.onMemoryPressure(handler)

    // Budget is ~716.8 MB. 80% = ~573 MB. Allocate 600 MB to trigger warning.
    coordinator.requestAllocation('big-model', 600 * 1024 * 1024)

    expect(handler).toHaveBeenCalledWith('warning')
  })

  it('should emit critical when allocation exceeds 95% of budget', () => {
    const coordinator = createGPUResourceCoordinator(VRAM)
    const handler = vi.fn()
    coordinator.onMemoryPressure(handler)

    // 95% of 716.8 MB ≈ 681 MB
    coordinator.requestAllocation('huge-model', 700 * 1024 * 1024)

    expect(handler).toHaveBeenCalledWith('critical')
  })

  it('should not emit pressure when VRAM is unknown (Infinity budget)', () => {
    const coordinator = createGPUResourceCoordinator(0)
    const handler = vi.fn()
    coordinator.onMemoryPressure(handler)

    coordinator.requestAllocation('model', 999 * 1024 * 1024 * 1024) // 999 GB
    expect(handler).not.toHaveBeenCalled()
  })

  it('should track LRU model correctly', () => {
    const coordinator = createGPUResourceCoordinator(VRAM)

    // Allocate both models
    const oldToken = coordinator.requestAllocation('old', 100 * 1024 * 1024)
    const newToken = coordinator.requestAllocation('new', 100 * 1024 * 1024)

    // Manually set timestamps to ensure deterministic ordering
    oldToken.lastUsedAt = 1000
    newToken.lastUsedAt = 2000

    expect(coordinator.getLRUModel()).toBe('old')

    // Touch the old one — now it's the freshest
    coordinator.touch('old')
    expect(coordinator.getLRUModel()).toBe('new')
  })

  it('should update allocation if model already exists', () => {
    const coordinator = createGPUResourceCoordinator(VRAM)

    coordinator.requestAllocation('model', 100 * 1024 * 1024)
    expect(coordinator.getUsage().allocated).toBe(100 * 1024 * 1024)

    // Re-allocate with different size
    coordinator.requestAllocation('model', 200 * 1024 * 1024)
    expect(coordinator.getUsage().allocated).toBe(200 * 1024 * 1024)
    expect(coordinator.getUsage().models).toEqual(['model'])
  })

  it('should allow unsubscribing from pressure events', () => {
    const coordinator = createGPUResourceCoordinator(VRAM)
    const handler = vi.fn()
    const unsub = coordinator.onMemoryPressure(handler)

    unsub()
    coordinator.requestAllocation('model', 700 * 1024 * 1024)
    expect(handler).not.toHaveBeenCalled()
  })

  describe('device loss telemetry', () => {
    it('should start with zero device-loss metrics', () => {
      const coordinator = createGPUResourceCoordinator(VRAM)
      const metrics = coordinator.getDeviceLossMetrics()

      expect(metrics.totalCount).toBe(0)
      expect(metrics.byModel).toEqual({})
      expect(metrics.lastEvent).toBeNull()
    })

    it('should aggregate device-loss events across models', () => {
      const coordinator = createGPUResourceCoordinator(VRAM)

      coordinator.recordDeviceLoss({ modelId: 'kokoro', reason: 'unknown', occurredAt: 100 })
      coordinator.recordDeviceLoss({ modelId: 'kokoro', reason: 'unknown', occurredAt: 200 })
      coordinator.recordDeviceLoss({ modelId: 'whisper', reason: 'destroyed', occurredAt: 300 })

      const metrics = coordinator.getDeviceLossMetrics()
      expect(metrics.totalCount).toBe(3)
      expect(metrics.byModel).toEqual({ kokoro: 2, whisper: 1 })
      expect(metrics.lastEvent).toEqual({ modelId: 'whisper', reason: 'destroyed', occurredAt: 300 })
    })

    it('should notify subscribers on device-loss events', () => {
      const coordinator = createGPUResourceCoordinator(VRAM)
      const handler = vi.fn()
      coordinator.onDeviceLoss(handler)

      const event = { modelId: 'kokoro', reason: 'unknown' as const, occurredAt: 100 }
      coordinator.recordDeviceLoss(event)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(event)
    })

    it('should allow unsubscribing from device-loss events', () => {
      const coordinator = createGPUResourceCoordinator(VRAM)
      const handler = vi.fn()
      const unsub = coordinator.onDeviceLoss(handler)

      unsub()
      coordinator.recordDeviceLoss({ modelId: 'x', reason: 'unknown', occurredAt: 1 })

      expect(handler).not.toHaveBeenCalled()
    })
  })
})
