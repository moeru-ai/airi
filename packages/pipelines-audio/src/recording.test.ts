import type { PcmBlock } from './index'

import { describe, expect, it, vi } from 'vitest'

import { AudioInput, createPushStream, Recording } from './index'

describe('file recording', () => {
  it('cancels pending permission without capturing late source audio', async () => {
    const permission = Promise.withResolvers<AudioInput>()
    const close = vi.fn(async () => {})
    const encode = vi.fn(async () => new Blob(['audio']))
    const recording = new Recording(() => permission.promise, { mimeType: 'audio/wav', sampleRate: 16000, channels: 1 })
    expect(recording.state.phase).toBe('pending')
    recording.cancel('User released before permission')
    expect(await recording.done).toEqual({ status: 'cancelled', reason: 'User released before permission' })
    const source = new AudioInput({ id: 'shared', frames: createPushStream<PcmBlock>().stream, close }, { supportsFile: () => true, encode })
    permission.resolve(source)
    await Promise.resolve()
    expect(encode).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    await source.close()
  })

  it('produces a file for preview without transcription or message submission', async () => {
    const source = createPushStream<PcmBlock>()
    const input = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, {
      supportsFile: () => true,
      encode: async (frames) => {
        const data: number[] = []
        for await (const block of frames)
          data.push(...block.channels[0])
        return new Blob([JSON.stringify(data)], { type: 'audio/wav' })
      },
    })
    const recording = new Recording(async () => input, { mimeType: 'audio/wav', sampleRate: 16000, channels: 1 })
    await expect.poll(() => recording.state.phase).toBe('capturing')
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 2 }, sampleRate: 16000, channels: [new Float32Array([0.25, 0.5])] })
    await expect.poll(() => input.position.frame).toBe(2)
    const result = await recording.finish()
    expect(result.status).toBe('finished')
    if (result.status !== 'finished')
      throw new Error('Recording failed')
    expect(await result.value.text()).toBe('[0.25,0.5]')
    expect(recording.state.phase).toBe('settled')
    await input.close()
  })
})
