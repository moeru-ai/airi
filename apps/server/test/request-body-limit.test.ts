import { describe, expect, it } from 'vitest'

import { shouldBypassGlobalBodyLimit } from '../src/utils/request-body-limit'

describe('shouldBypassGlobalBodyLimit', () => {
  it('keeps the singing API off the global 1MB cap', () => {
    expect(shouldBypassGlobalBodyLimit('/api/v1/singing')).toBe(true)
    expect(shouldBypassGlobalBodyLimit('/api/v1/singing/cover')).toBe(true)
    expect(shouldBypassGlobalBodyLimit('/api/v1/singing/train')).toBe(true)
  })

  it('still bypasses the dedicated transcription upload route', () => {
    expect(shouldBypassGlobalBodyLimit('/api/v1/openai/audio/transcriptions')).toBe(true)
  })

  it('does not bypass unrelated API routes', () => {
    expect(shouldBypassGlobalBodyLimit('/api/v1/chats')).toBe(false)
    expect(shouldBypassGlobalBodyLimit('/api/v1/providers')).toBe(false)
  })
})
