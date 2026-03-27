import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appendVoiceTranscript, useVoiceAutoSend } from './use-voice-auto-send'

describe('appendVoiceTranscript', () => {
  it('joins trimmed transcript chunks with a single space', () => {
    expect(appendVoiceTranscript('', ' hello ')).toBe('hello')
    expect(appendVoiceTranscript('hello', ' world ')).toBe('hello world')
  })

  it('ignores empty chunks', () => {
    expect(appendVoiceTranscript('hello', '   ')).toBe('hello')
  })
})

describe('useVoiceAutoSend', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('flushes queued transcript chunks after the configured delay', async () => {
    const sendText = vi.fn(async () => {})
    const voiceAutoSend = useVoiceAutoSend({
      enabled: true,
      delayMs: 200,
      sendText,
    })

    voiceAutoSend.queue('hello')
    voiceAutoSend.queue('world')

    await vi.advanceTimersByTimeAsync(199)
    expect(sendText).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText).toHaveBeenCalledWith('hello world')
  })

  it('clears pending text when auto send is disabled', async () => {
    const sendText = vi.fn(async () => {})
    let enabled = false
    const voiceAutoSend = useVoiceAutoSend({
      enabled: () => enabled,
      delayMs: 50,
      sendText,
    })

    voiceAutoSend.queue('hello')
    await vi.advanceTimersByTimeAsync(50)

    expect(sendText).not.toHaveBeenCalled()
    expect(voiceAutoSend.pendingText.value).toBe('')

    enabled = true
    voiceAutoSend.queue('world')
    await vi.advanceTimersByTimeAsync(50)

    expect(sendText).toHaveBeenCalledWith('world')
  })
})
