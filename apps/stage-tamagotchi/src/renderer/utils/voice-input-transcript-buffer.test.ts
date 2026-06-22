import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createVoiceInputTranscriptBuffer } from './voice-input-transcript-buffer'

describe('createVoiceInputTranscriptBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('merges adjacent transcription fragments before flushing to chat', async () => {
    const flushed: string[] = []
    const buffer = createVoiceInputTranscriptBuffer({
      flushDelayMs: 1200,
      flush: async (text) => {
        flushed.push(text)
      },
    })

    buffer.push('我今天想测试一下')
    vi.advanceTimersByTime(800)
    buffer.push('长句识别会不会好一点')
    await vi.advanceTimersByTimeAsync(1200)

    expect(flushed).toEqual(['我今天想测试一下长句识别会不会好一点'])
  })

  it('keeps a separator between mixed latin words while merging fragments', async () => {
    const flushed: string[] = []
    const buffer = createVoiceInputTranscriptBuffer({
      flushDelayMs: 1200,
      flush: async (text) => {
        flushed.push(text)
      },
    })

    buffer.push('hello')
    vi.advanceTimersByTime(800)
    buffer.push('world')
    await vi.advanceTimersByTimeAsync(1200)

    expect(flushed).toEqual(['hello world'])
  })

  it('flushes immediately when a fragment reaches the long speech threshold', async () => {
    const flushed: string[] = []
    const buffer = createVoiceInputTranscriptBuffer({
      flushDelayMs: 1200,
      maxBufferedTextLength: 6,
      flush: async (text) => {
        flushed.push(text)
      },
    })

    buffer.push('这是一段很长的文字')
    await Promise.resolve()

    expect(flushed).toEqual(['这是一段很长的文字'])
  })

  it('flushes pending text when disposed', async () => {
    const flushed: string[] = []
    const buffer = createVoiceInputTranscriptBuffer({
      flushDelayMs: 1200,
      flush: async (text) => {
        flushed.push(text)
      },
    })

    buffer.push('关闭之前还有一句话')
    await buffer.dispose()

    expect(flushed).toEqual(['关闭之前还有一句话'])
  })

  it('clears pending text without flushing when speech input is only being paused', async () => {
    const flushed: string[] = []
    const buffer = createVoiceInputTranscriptBuffer({
      flushDelayMs: 1200,
      flush: async (text) => {
        flushed.push(text)
      },
    })

    buffer.push('这句话还不应该发送')
    buffer.clear()
    await vi.advanceTimersByTimeAsync(1200)

    expect(flushed).toEqual([])
  })
})
