import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { expect, it } from 'vitest'

import { createReplaySource } from './replay-source'

it('delivers the clip in real time, then silence until the reader leaves', async () => {
  // 250 ms at 1 kHz: three blocks of 100 frames, the last one short.
  const clip = Float32Array.from({ length: 250 }, () => 0.5)
  const source = createReplaySource(clip, 1000)
  const reader = new AbortController()
  const blocks: PcmBlock[] = []
  const startedAt = performance.now()

  for await (const block of source.open(reader.signal)) {
    blocks.push(block)
    if (blocks.length === 5)
      reader.abort()
  }

  await source.clipEnded
  // The fifth block starts at frame 350, so it is due 350 ms after the first one. Timers can run late, but never early.
  expect(performance.now() - startedAt).toBeGreaterThanOrEqual(340)
  expect(blocks.map(block => [block.range.startFrame, block.range.endFrame])).toEqual([[0, 100], [100, 200], [200, 250], [250, 350], [350, 450]])
  expect(blocks.slice(0, 3).every(block => block.channels[0]!.every(sample => sample === 0.5))).toBe(true)
  expect(blocks.slice(3).every(block => block.channels[0]!.every(sample => sample === 0))).toBe(true)
  expect(new Set(blocks.map(block => block.range.sourceId)).size).toBe(1)
})

it('ends the clip when the reader leaves before the clip ends', async () => {
  const source = createReplaySource(new Float32Array(1000), 1000)
  const reader = new AbortController()

  for await (const _block of source.open(reader.signal))
    reader.abort()

  // The clip is 1 s long. It must end with the reader, not after its full length.
  await expect(Promise.race([source.clipEnded.then(() => 'ended'), new Promise(resolve => setTimeout(resolve, 500, 'pending'))])).resolves.toBe('ended')
})
