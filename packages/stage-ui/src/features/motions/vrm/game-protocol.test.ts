import { describe, expect, it } from 'vitest'

import * as v from 'valibot'

import { gameMotionRequestSchema, gameMotionResultSchema, gameMotionRevokedSchema } from './game-protocol'

const correlation = { modelId: 'avatar', ownerId: 'port/session', sessionId: 1, requestId: 'request' }
const runtime = { ...correlation, instanceId: 'loaded-avatar' }

describe('game motion protocol', () => {
  it('permits only named gestures with loaded-instance correlation', () => {
    expect(v.safeParse(gameMotionRequestSchema, { ...correlation, type: 'reserve' }).success).toBe(true)
    expect(v.safeParse(gameMotionRequestSchema, { ...runtime, type: 'heartbeat' }).success).toBe(true)
    expect(v.safeParse(gameMotionRequestSchema, { ...runtime, type: 'play', leaseId: 'lease', intentName: 'wave' }).success).toBe(true)
    expect(v.safeParse(gameMotionRequestSchema, { ...correlation, type: 'play', leaseId: 'lease', intentName: 'wave' }).success).toBe(false)
    expect(v.safeParse(gameMotionRequestSchema, { ...runtime, type: 'play', leaseId: 'lease', intentName: 'url:https://example.test/a.vrma' }).success).toBe(false)
    expect(v.safeParse(gameMotionRequestSchema, { ...runtime, type: 'play', leaseId: 'lease', intentName: 'wave', options: { loop: true } }).success).toBe(false)
  })

  it.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid session %s', (sessionId) => {
    expect(v.safeParse(gameMotionRequestSchema, { ...correlation, sessionId, type: 'reserve' }).success).toBe(false)
  })

  it.each(['', 'a'.repeat(257)])('rejects empty or oversized identifiers', (identifier) => {
    for (const field of ['modelId', 'ownerId', 'requestId', 'instanceId'])
      expect(v.safeParse(gameMotionRequestSchema, { ...runtime, [field]: identifier, type: 'heartbeat' }).success).toBe(false)
  })

  it('requires complete result and revocation correlation', () => {
    expect(v.safeParse(gameMotionResultSchema, { ...runtime, type: 'reserve', accepted: true }).success).toBe(true)
    expect(v.safeParse(gameMotionResultSchema, { ...correlation, type: 'reserve', accepted: true }).success).toBe(false)
    expect(v.safeParse(gameMotionResultSchema, { ...runtime, type: 'release-session', accepted: true }).success).toBe(false)
    expect(v.safeParse(gameMotionResultSchema, { ...runtime, type: 'play', accepted: 'true' }).success).toBe(false)
    expect(v.safeParse(gameMotionRevokedSchema, { modelId: 'avatar', instanceId: 'loaded-avatar', ownerId: 'owner', sessionId: 1 }).success).toBe(true)
    expect(v.safeParse(gameMotionRevokedSchema, { ownerId: 'owner', sessionId: 1 }).success).toBe(false)
  })
})
