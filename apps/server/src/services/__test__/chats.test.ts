import { describe, expect, it } from 'vitest'

import { clampLimit, resolveSenderId } from '../chats'

describe('resolveSenderId', () => {
  it('returns userId for user role', () => {
    expect(resolveSenderId('user', 'user-123', 'char-456')).toBe('user-123')
  })
  it('returns characterId for non-user role when available', () => {
    expect(resolveSenderId('assistant', 'user-123', 'char-456')).toBe('char-456')
  })
  it('returns null for non-user role without characterId', () => {
    expect(resolveSenderId('assistant', 'user-123')).toBeNull()
    expect(resolveSenderId('system', 'user-123', null)).toBeNull()
  })
})

describe('clampLimit', () => {
  it('returns default 100 when no limit', () => {
    expect(clampLimit()).toBe(100)
    expect(clampLimit(undefined)).toBe(100)
  })
  it('returns default 100 for zero or negative', () => {
    expect(clampLimit(0)).toBe(100)
    expect(clampLimit(-5)).toBe(100)
  })
  it('returns limit when within range', () => {
    expect(clampLimit(50)).toBe(50)
    expect(clampLimit(500)).toBe(500)
  })
  it('clamps to max 500', () => {
    expect(clampLimit(501)).toBe(500)
    expect(clampLimit(1000)).toBe(500)
  })
})
