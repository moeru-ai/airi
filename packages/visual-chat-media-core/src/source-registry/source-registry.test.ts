import { describe, expect, it } from 'vitest'

import { SourceRegistry } from '.'

describe('sourceRegistry', () => {
  it('should register a source', () => {
    const reg = new SourceRegistry()
    const src = reg.register('user1', 'track-1', 'phone-camera')
    expect(src.sourceId).toMatch(/^src_/)
    expect(src.participantIdentity).toBe('user1')
    expect(src.sourceType).toBe('phone-camera')
    expect(reg.size).toBe(1)
  })

  it('should not duplicate on same trackSid', () => {
    const reg = new SourceRegistry()
    const src1 = reg.register('user1', 'track-1', 'phone-camera')
    const src2 = reg.register('user1', 'track-1', 'phone-camera')
    expect(src1.sourceId).toBe(src2.sourceId)
    expect(reg.size).toBe(1)
  })

  it('should unregister by sourceId', () => {
    const reg = new SourceRegistry()
    const src = reg.register('user1', 'track-1', 'phone-camera')
    expect(reg.unregister(src.sourceId)).toBe(true)
    expect(reg.size).toBe(0)
  })

  it('should find by type', () => {
    const reg = new SourceRegistry()
    reg.register('user1', 't1', 'phone-camera')
    reg.register('user1', 't2', 'phone-mic')
    reg.register('user2', 't3', 'laptop-camera')

    expect(reg.findByType('phone-camera')).toHaveLength(1)
    expect(reg.getVideoSources()).toHaveLength(2)
    expect(reg.getAudioSources()).toHaveLength(1)
  })

  it('should update timestamp and active state', () => {
    const reg = new SourceRegistry()
    const src = reg.register('user1', 't1', 'phone-camera')
    reg.updateTimestamp(src.sourceId, 12345)
    reg.setActive(src.sourceId, true)

    const updated = reg.get(src.sourceId)!
    expect(updated.lastFrameTimestamp).toBe(12345)
    expect(updated.isActive).toBe(true)
  })
})
