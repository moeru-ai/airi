import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTranscriptBuffer } from './transcript-buffer'

/**
 * @example
 * Recorder-backed ASR fragments are grouped into one spoken turn.
 */
describe('createTranscriptBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * @example
   * Adjacent CJK fragments are joined without an artificial space.
   */
  it('merges adjacent transcription fragments before flushing', async () => {
    const flushed: string[] = []
    const buffer = createTranscriptBuffer({
      flushDelayMs: 1200,
      async flush(text) {
        flushed.push(text)
      },
    })

    buffer.push('我今天想测试一下')
    vi.advanceTimersByTime(800)
    buffer.push('长句识别会不会好一点')
    await vi.advanceTimersByTimeAsync(1200)

    /**
     * @example
     * The two CJK fragments form one chat turn.
     */
    expect(flushed).toEqual(['我今天想测试一下长句识别会不会好一点'])
  })

  /**
   * @example
   * Adjacent Latin fragments keep a readable word separator.
   */
  it('keeps a separator between Latin fragments', async () => {
    const flushed: string[] = []
    const buffer = createTranscriptBuffer({
      flushDelayMs: 1200,
      async flush(text) {
        flushed.push(text)
      },
    })

    buffer.push('hello')
    buffer.push('world')
    await vi.advanceTimersByTimeAsync(1200)

    /**
     * @example
     * Latin words remain separated after grouping.
     */
    expect(flushed).toEqual(['hello world'])
  })

  /**
   * @example
   * Long transcripts flush without waiting for the pause timer.
   */
  it('flushes immediately at the configured text-length limit', async () => {
    const flushed: string[] = []
    const buffer = createTranscriptBuffer({
      flushDelayMs: 1200,
      maxBufferedTextLength: 6,
      async flush(text) {
        flushed.push(text)
      },
    })

    buffer.push('这是一段很长的文字')
    await Promise.resolve()

    /**
     * @example
     * The long fragment bypasses the delayed timer.
     */
    expect(flushed).toEqual(['这是一段很长的文字'])
  })

  /**
   * @example
   * Dispose flushes pending text before the microphone session stops.
   */
  it('flushes pending text when disposed', async () => {
    const flushed: string[] = []
    const buffer = createTranscriptBuffer({
      flushDelayMs: 1200,
      async flush(text) {
        flushed.push(text)
      },
    })

    buffer.push('关闭之前还有一句话')
    await buffer.dispose()

    /**
     * @example
     * Pending text is delivered exactly once during disposal.
     */
    expect(flushed).toEqual(['关闭之前还有一句话'])
  })

  /**
   * @example
   * Clearing a paused voice session discards pending text.
   */
  it('clears pending text without flushing it', async () => {
    const flushed: string[] = []
    const buffer = createTranscriptBuffer({
      flushDelayMs: 1200,
      async flush(text) {
        flushed.push(text)
      },
    })

    buffer.push('这句话不应该发送')
    buffer.clear()
    await vi.advanceTimersByTimeAsync(1200)

    /**
     * @example
     * No transcript is delivered after clear.
     */
    expect(flushed).toEqual([])
  })
})
