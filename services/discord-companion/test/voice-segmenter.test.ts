import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import { createVoiceSegmenter } from '../src/audio/voice-segmenter'

function makeStream(): Readable & {
  emitData: (chunk: Buffer | string) => void
  emitStart: () => void
  emitStop: () => void
  emitEnd: () => void
} {
  const stream = new Readable({ read() {} })
  return Object.assign(stream, {
    emitData: (chunk: Buffer | string) => stream.emit('data', chunk),
    emitStart: () => stream.emit('speakingStarted'),
    emitStop: () => stream.emit('speakingStopped'),
    emitEnd: () => stream.emit('end'),
  })
}

/**
 * @example
 * // speakingStarted -> data -> speakingStopped -> onSegment fires
 */
describe('createVoiceSegmenter', () => {
  it('emits a single segment between speakingStarted and speakingStopped', async () => {
    const stream = makeStream()
    const onStart = vi.fn()
    const onSegment = vi.fn()

    const segmenter = createVoiceSegmenter(stream, { onStart, onSegment })

    stream.emitStart()
    stream.emitData(Buffer.from([1, 2]))
    stream.emitData(Buffer.from([3, 4]))
    stream.emitStop()

    await vi.waitFor(() => expect(onSegment).toHaveBeenCalledTimes(1))
    expect(onStart).toHaveBeenCalledTimes(1)
    const payload = onSegment.mock.calls[0][0] as Buffer
    expect([...payload]).toEqual([1, 2, 3, 4])

    segmenter.stop()
  })

  it('drains remaining audio on end when still speaking', async () => {
    const stream = makeStream()
    const onSegment = vi.fn()

    createVoiceSegmenter(stream, { onStart: () => {}, onSegment })

    stream.emitStart()
    stream.emitData(Buffer.from([9, 9]))
    stream.emitEnd()

    await vi.waitFor(() => expect(onSegment).toHaveBeenCalledTimes(1))
  })

  it('ignores events after end', async () => {
    const stream = makeStream()
    const onSegment = vi.fn()

    createVoiceSegmenter(stream, { onStart: () => {}, onSegment })

    stream.emitEnd()
    stream.emitStart()
    stream.emitData(Buffer.from([1]))
    stream.emitStop()

    await new Promise(resolve => setTimeout(resolve, 20))
    expect(onSegment).not.toHaveBeenCalled()
  })
})

/**
 * Guards against `stop()` leaving listeners behind.
 */
describe('createVoiceSegmenter#stop', () => {
  it('removes all registered listeners', () => {
    const stream = makeStream()

    const { stop } = createVoiceSegmenter(stream, {
      onStart: () => {},
      onSegment: () => {},
    })

    expect(stream.listenerCount('data')).toBe(1)
    expect(stream.listenerCount('end')).toBe(1)
    expect(stream.listenerCount('speakingStarted')).toBe(1)
    expect(stream.listenerCount('speakingStopped')).toBe(1)

    stop()

    expect(stream.listenerCount('data')).toBe(0)
    expect(stream.listenerCount('end')).toBe(0)
    expect(stream.listenerCount('speakingStarted')).toBe(0)
    expect(stream.listenerCount('speakingStopped')).toBe(0)
  })
})
