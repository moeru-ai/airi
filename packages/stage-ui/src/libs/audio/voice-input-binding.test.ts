import { describe, expect, it, vi } from 'vitest'

import { createVoiceInputBinding } from './voice-input-binding'

describe('createVoiceInputBinding', () => {
  it('starts the stream that arrives after microphone enable', async () => {
    const start = vi.fn(async () => {})
    const stop = vi.fn(async () => {})
    const lifecycle = createVoiceInputBinding({ start, stop })
    const stream = {} as MediaStream

    await lifecycle.update()
    await lifecycle.update({ stream, mode: 'stream' })

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

    const starting = lifecycle.update({ stream: first, mode: 'stream' })
    await Promise.resolve()
    const replacing = lifecycle.update({ stream: second, mode: 'stream' })
    expect(events).toEqual(['start first'])

    finishStart()
    await Promise.all([starting, replacing])
    expect(events).toEqual(['start first', 'stop', 'start second'])
  })

  it('skips stale startup when toggled off before the queued work begins', async () => {
    const start = vi.fn(async () => {})
    const lifecycle = createVoiceInputBinding({ start, stop: async () => {} })
    const stream = {} as MediaStream

    const enabling = lifecycle.update({ stream, mode: 'stream' })
    const disabling = lifecycle.update()
    await Promise.all([enabling, disabling])

    expect(start).not.toHaveBeenCalled()
  })
})
