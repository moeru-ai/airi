import { describe, expect, it } from 'vitest'

import { ManualSwitchPolicy } from '.'
import { SourceRegistry } from '../source-registry'

describe('manualSwitchPolicy', () => {
  it('should select phone-camera as default active video', () => {
    const reg = new SourceRegistry()
    reg.register('user1', 't1', 'phone-camera')
    reg.register('user1', 't2', 'phone-mic')
    reg.register('user2', 't3', 'laptop-camera')

    const policy = new ManualSwitchPolicy()
    const result = policy.select(reg)

    expect(result.activeVideo?.sourceType).toBe('phone-camera')
    expect(result.activeAudio?.sourceType).toBe('phone-mic')
    expect(result.standbyVideo).toHaveLength(1)
  })

  it('should allow manual override by sourceType', () => {
    const reg = new SourceRegistry()
    reg.register('user1', 't1', 'phone-camera')
    reg.register('user1', 't2', 'phone-mic')
    const screen = reg.register('user2', 't3', 'screen-share')
    reg.register('user2', 't4', 'laptop-mic')

    const policy = new ManualSwitchPolicy()
    const result = policy.select(reg, screen.sourceId)

    expect(result.activeVideo?.sourceType).toBe('screen-share')
    expect(result.activeAudio?.sourceType).toBe('laptop-mic')
  })

  it('should handle empty registry', () => {
    const reg = new SourceRegistry()
    const policy = new ManualSwitchPolicy()
    const result = policy.select(reg)

    expect(result.activeVideo).toBeNull()
    expect(result.activeAudio).toBeNull()
    expect(result.standbyVideo).toHaveLength(0)
    expect(result.standbyAudio).toHaveLength(0)
  })

  it('should fallback to first audio when no matching device audio', () => {
    const reg = new SourceRegistry()
    reg.register('user1', 't1', 'screen-share')
    reg.register('user1', 't2', 'phone-mic')

    const policy = new ManualSwitchPolicy()
    const result = policy.select(reg)

    expect(result.activeVideo?.sourceType).toBe('screen-share')
    expect(result.activeAudio?.sourceType).toBe('phone-mic')
  })
})
