import { describe, expect, it, vi } from 'vitest'

import { createVoiceInputBinding } from './voice-input-binding'

describe('createVoiceInputBinding', () => {
  it('reports waiting, starting, listening, and off as the stream arrives and leaves', async () => {
    let releaseStart!: () => void
    const lifecycle = createVoiceInputBinding({
      start: async () => await new Promise<void>((resolve) => { releaseStart = resolve }),
      stop: async () => {},
    })
    const stream = {} as MediaStream

    await lifecycle.update({ enabled: true, mode: 'stream' })
    expect(lifecycle.state.status).toBe('awaiting-stream')

    const starting = lifecycle.update({ enabled: true, stream, mode: 'stream' })
    await Promise.resolve()
    expect(lifecycle.state.status).toBe('starting')

    releaseStart()
    await starting
    expect(lifecycle.state.status).toBe('listening')

    await lifecycle.update({ enabled: false, mode: 'stream' })
    expect(lifecycle.state.status).toBe('off')
  })

  it('does not restart after disposal, even if a late stream arrives', async () => {
    const start = vi.fn(async () => {})
    const lifecycle = createVoiceInputBinding({ start, stop: async () => {} })

    await lifecycle.dispose()
    await lifecycle.update({ enabled: true, stream: {} as MediaStream, mode: 'stream' })

    expect(lifecycle.state.status).toBe('disposed')
    expect(start).not.toHaveBeenCalled()
  })

  it('keeps a failed cleanup owned so the next transition can retry it', async () => {
    const stop = vi.fn().mockRejectedValueOnce(new Error('release failed')).mockResolvedValue(undefined)
    const start = vi.fn(async () => {})
    const lifecycle = createVoiceInputBinding({ start, stop })
    const stream = {} as MediaStream

    await lifecycle.update({ enabled: true, stream, mode: 'stream' })
    await expect(lifecycle.update({ enabled: false, mode: 'stream' })).rejects.toThrow('release failed')
    expect(lifecycle.state.status).toBe('error')

    await lifecycle.update({ enabled: false, mode: 'stream' })
    expect(stop).toHaveBeenCalledTimes(2)
    expect(lifecycle.state.status).toBe('off')
  })
  it('starts the stream that arrives after microphone enable', async () => {
    const start = vi.fn(async () => {})
    const stop = vi.fn(async () => {})
    const lifecycle = createVoiceInputBinding({ start, stop })
    const stream = {} as MediaStream

    await lifecycle.update({ enabled: true, mode: 'stream' })
    await lifecycle.update({ enabled: true, stream, mode: 'stream' })

    expect(start).toHaveBeenCalledWith({ stream, mode: 'stream' })
  })

  // ROOT CAUSE:
  //
  // A pending VAD start could finish after the mic was disabled or changed.
  // Its old cleanup then stopped the new stream's ASR session.
  // The binding now waits for cleanup before starting the newest requested stream.
  it('releases an in-flight start before binding a replacement stream', async () => {
    const events: string[] = []
    let finishStart!: () => void
    const first = {} as MediaStream
    const second = {} as MediaStream
    const lifecycle = createVoiceInputBinding({
      async start({ stream }) {
        events.push(stream === first ? 'start first' : 'start second')
        if (stream === first)
          await new Promise<void>((resolve) => { finishStart = resolve })
      },
      async stop() {
        events.push('stop')
      },
    })

    const starting = lifecycle.update({ enabled: true, stream: first, mode: 'stream' })
    await Promise.resolve()
    const replacing = lifecycle.update({ enabled: true, stream: second, mode: 'stream' })
    expect(events).toEqual(['start first'])

    finishStart()
    await Promise.all([starting, replacing])
    expect(events).toEqual(['start first', 'stop', 'start second'])
  })

  it('skips stale startup when toggled off before the queued work begins', async () => {
    const start = vi.fn(async () => {})
    const lifecycle = createVoiceInputBinding({ start, stop: async () => {} })
    const stream = {} as MediaStream

    const enabling = lifecycle.update({ enabled: true, stream, mode: 'stream' })
    const disabling = lifecycle.update({ enabled: false, mode: 'stream' })
    await Promise.all([enabling, disabling])

    expect(start).not.toHaveBeenCalled()
  })
})
