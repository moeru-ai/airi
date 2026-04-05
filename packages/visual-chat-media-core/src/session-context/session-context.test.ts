import { describe, expect, it } from 'vitest'

import { createSessionContext, updateSessionActivity, updateSessionState } from '.'

describe('sessionContext', () => {
  it('should create with defaults', () => {
    const ctx = createSessionContext('test-room')
    expect(ctx.sessionId).toMatch(/^ses_/)
    expect(ctx.roomName).toBe('test-room')
    expect(ctx.mode).toBe('vision-text-realtime')
    expect(ctx.state).toBe('idle')
    expect(ctx.activeVideoSource).toBeNull()
    expect(ctx.activeAudioSource).toBeNull()
    expect(ctx.standbyVideoSources).toEqual([])
    expect(ctx.standbyAudioSources).toEqual([])
    expect(ctx.inferenceState.isRunning).toBe(false)
    expect(ctx.inferenceState.currentCnt).toBe(0)
    expect(ctx.createdAt).toBeGreaterThan(0)
  })

  it('should update state immutably', () => {
    const ctx = createSessionContext('room2')
    const updated = updateSessionState(ctx, 'connected')
    expect(updated.state).toBe('connected')
    expect(ctx.state).toBe('idle') // original unchanged
    expect(updated.lastActivityAt).toBeGreaterThanOrEqual(ctx.lastActivityAt)
  })

  it('should update activity timestamp', () => {
    const ctx = createSessionContext('room3')
    const before = ctx.lastActivityAt
    const updated = updateSessionActivity(ctx)
    expect(updated.lastActivityAt).toBeGreaterThanOrEqual(before)
  })
})
