import { describe, expect, it, vi } from 'vitest'

import { createVadStreamingSession } from './vad-streaming-session'

describe('createVadStreamingSession', () => {
  it('exposes the provider lifecycle for one utterance', async () => {
    let releaseStart!: () => void
    let releaseStop!: () => void
    const session = createVadStreamingSession({
      start: async () => await new Promise<void>((resolve) => { releaseStart = resolve }),
      stop: async () => await new Promise<void>((resolve) => { releaseStop = resolve }),
      cancel: async () => {},
    })

    expect(session.state.status).toBe('idle')
    session.onSpeechStart()
    await vi.waitFor(() => expect(session.state.status).toBe('opening'))
    releaseStart()
    await vi.waitFor(() => expect(session.state.status).toBe('streaming'))
    session.onSpeechEnd()
    await vi.waitFor(() => expect(session.state.status).toBe('closing'))
    releaseStop()
    await vi.waitFor(() => expect(session.state.status).toBe('idle'))
    await session.dispose()
    expect(session.state.status).toBe('disposed')
  })

  it('returns to idle after a provider start error so the next utterance can retry', async () => {
    const error = new Error('upstream failed')
    const onError = vi.fn()
    const start = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined)
    const session = createVadStreamingSession<void>({ start, stop: async () => {}, cancel: async () => {}, onError })

    session.onSpeechStart()
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error))
    expect(session.state.status).toBe('error')

    session.onSpeechEnd()
    session.onSpeechStart()
    await vi.waitFor(() => expect(session.state.status).toBe('streaming'))
    expect(start).toHaveBeenCalledTimes(2)
    await session.dispose()
  })
  it('starts one transcription session for a detected speech segment and stops it after silence', async () => {
    const start = vi.fn(async () => {})
    const stop = vi.fn(async () => {})
    const session = createVadStreamingSession({ start, stop, cancel: stop })

    session.onSpeechStart()
    session.onSpeechStart()
    session.onSpeechEnd()

    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1))

    expect(start).toHaveBeenCalledTimes(1)
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('aborts a cancelled VAD segment without requesting a final transcript', async () => {
    // ROOT CAUSE:
    // VAD cancellation used the same finish path as silence and could emit text.
    // A cancelled segment must abort its provider session.
    const stop = vi.fn(async () => {})
    const cancel = vi.fn(async () => {})
    const session = createVadStreamingSession({ start: async () => {}, stop, cancel })

    session.onSpeechStart()
    await vi.waitFor(() => expect(session.state.status).toBe('streaming'))
    session.onSpeechCancel()
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce())

    expect(stop).not.toHaveBeenCalled()
    expect(session.state.status).toBe('idle')
  })

  it('stops a session when speech ends before its asynchronous start completes', async () => {
    let releaseStart!: () => void
    const start = vi.fn(async () => await new Promise<void>((resolve) => {
      releaseStart = resolve
    }))
    const stop = vi.fn(async () => {})
    const session = createVadStreamingSession({ start, stop, cancel: stop })

    session.onSpeechStart()
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1))
    session.onSpeechEnd()
    releaseStart()

    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1))

    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('starts a fresh provider session for speech detected after the first segment stops', async () => {
    const start = vi.fn(async () => {})
    const stop = vi.fn(async () => {})
    const session = createVadStreamingSession({ start, stop, cancel: stop })

    session.onSpeechStart()
    session.onSpeechEnd()
    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1))

    session.onSpeechStart()
    session.onSpeechEnd()
    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(2))

    expect(start).toHaveBeenCalledTimes(2)
  })

  it('keeps each queued start bound to its own speech segment', async () => {
    const starts: number[] = []
    let releaseFirstStop!: () => void
    const stop = vi.fn(async () => {
      if (stop.mock.calls.length === 1)
        await new Promise<void>((resolve) => { releaseFirstStop = resolve })
    })
    const session = createVadStreamingSession<number>({
      start: async (segment) => { starts.push(segment) },
      stop,
      cancel: stop,
    })

    // ROOT CAUSE:
    //
    // A queued start read the latest mutable segment after the previous stop completed.
    // Three rapid segments then started as [1, 3, 3] and skipped segment 2.
    // The queue now captures each segment when speech starts.
    session.onSpeechStart(1)
    session.onSpeechEnd()
    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1))

    session.onSpeechStart(2)
    session.onSpeechEnd()
    session.onSpeechStart(3)
    session.onSpeechEnd()

    releaseFirstStop()
    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(3))

    expect(starts).toEqual([1, 2, 3])
  })

  it('does not start another session after disposal', async () => {
    const start = vi.fn(async () => {})
    const stop = vi.fn(async () => {})
    const session = createVadStreamingSession({ start, stop, cancel: stop })

    await session.dispose()
    session.onSpeechStart()

    expect(start).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
  })

  it('aborts an in-flight final response when the microphone is disposed', async () => {
    // ROOT CAUSE:
    // A provider finish can wait for its final response. Disposal must abort
    // that response instead of waiting forever for it to finish.
    let releaseStop!: () => void
    const stop = vi.fn(async () => await new Promise<void>((resolve) => {
      releaseStop = resolve
    }))
    const cancel = vi.fn(async () => releaseStop())
    const session = createVadStreamingSession({ start: async () => {}, stop, cancel })

    session.onSpeechStart()
    await vi.waitFor(() => expect(session.state.status).toBe('streaming'))
    session.onSpeechEnd()
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())

    await session.dispose()

    expect(cancel).toHaveBeenCalledOnce()
    expect(session.state.status).toBe('disposed')
  })
})
