import { describe, expect, it, vi } from 'vitest'

import { createVadStreamingSession } from './vad-streaming-session'

describe('createVadStreamingSession', () => {
  it('starts one transcription session for a detected speech segment and stops it after silence', async () => {
    const start = vi.fn(async () => {})
    const stop = vi.fn(async () => {})
    const session = createVadStreamingSession({ start, stop })

    session.onSpeechStart()
    session.onSpeechStart()
    session.onSpeechEnd()

    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1))

    expect(start).toHaveBeenCalledTimes(1)
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('stops a session when speech ends before its asynchronous start completes', async () => {
    let releaseStart!: () => void
    const start = vi.fn(async () => await new Promise<void>((resolve) => {
      releaseStart = resolve
    }))
    const stop = vi.fn(async () => {})
    const session = createVadStreamingSession({ start, stop })

    session.onSpeechStart()
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1))
    session.onSpeechEnd()
    releaseStart()

    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1))

    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('does not start another session after disposal', async () => {
    const start = vi.fn(async () => {})
    const stop = vi.fn(async () => {})
    const session = createVadStreamingSession({ start, stop })

    await session.dispose()
    session.onSpeechStart()

    expect(start).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
  })
})
