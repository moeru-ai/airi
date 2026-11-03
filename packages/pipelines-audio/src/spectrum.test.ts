import type { LiveAudioSource, PcmBlock } from './audio-input'

import { createPushStream } from '@proj-airi/stream-kit'
import { describe, expect, it } from 'vitest'

import { AudioInput } from './audio-input'
import { bandLevelsOf, observeSpectrum, voiceBands } from './spectrum'

const SAMPLE_RATE = 48000

/** A sine at `hz` with a peak of `amplitude`. */
function sine(hz: number, frames: number, amplitude = 0.5) {
  return Float32Array.from({ length: frames }, (_, frame) => amplitude * Math.sin(2 * Math.PI * hz * frame / SAMPLE_RATE))
}

function loudestBand(levels: number[]) {
  return levels.indexOf(Math.max(...levels))
}

describe('bandLevelsOf', () => {
  it('puts a tone in its own voice band', () => {
    expect(loudestBand(bandLevelsOf([sine(150, 1920)], SAMPLE_RATE))).toBe(0)
    expect(loudestBand(bandLevelsOf([sine(600, 1920)], SAMPLE_RATE))).toBe(1)
    expect(loudestBand(bandLevelsOf([sine(2000, 1920)], SAMPLE_RATE))).toBe(2)
    expect(loudestBand(bandLevelsOf([sine(5000, 1920)], SAMPLE_RATE))).toBe(3)
  })

  it('reads silence as 0 in every band, and a loud tone near 1 in its band', () => {
    expect(bandLevelsOf([new Float32Array(1920)], SAMPLE_RATE)).toEqual([0, 0, 0, 0])
    expect(bandLevelsOf([sine(600, 1920, 0.8)], SAMPLE_RATE)[1]).toBeGreaterThan(0.8)
  })

  it('reads an empty window as 0', () => {
    expect(bandLevelsOf([], SAMPLE_RATE, voiceBands)).toEqual([0, 0, 0, 0])
  })
})

/** White noise from a fixed seed, so a test sees the same noise each run. */
function noise(frames: number, seed: number, amplitude = 0.05) {
  let state = seed
  return Float32Array.from({ length: frames }, () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return amplitude * ((state / 2 ** 32) * 2 - 1)
  })
}

function standardDeviation(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}

describe('observeSpectrum', () => {
  it('publishes band levels for each window of the input', async () => {
    let pushed: ReturnType<typeof createPushStream<PcmBlock>> | undefined
    const source: LiveAudioSource = {
      live: true,
      open: () => {
        pushed = createPushStream<PcmBlock>()
        return pushed.stream
      },
    }
    const published: number[][] = []
    const controller = new AbortController()
    observeSpectrum(new AudioInput(source), controller.signal, levels => published.push(levels))

    await expect.poll(() => pushed).toBeDefined()
    pushed!.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4800 }, sampleRate: SAMPLE_RATE, channels: [sine(150, 4800)] })

    await expect.poll(() => published.length).toBeGreaterThan(0)
    expect(loudestBand(published[0])).toBe(0)
    controller.abort('done')
  })

  it('averages the last windows, so steady noise varies less than in single windows', async () => {
    let pushed: ReturnType<typeof createPushStream<PcmBlock>> | undefined
    const source: LiveAudioSource = {
      live: true,
      open: () => {
        pushed = createPushStream<PcmBlock>()
        return pushed.stream
      },
    }
    const published: number[][] = []
    const controller = new AbortController()
    observeSpectrum(new AudioInput(source), controller.signal, levels => published.push(levels))
    await expect.poll(() => pushed).toBeDefined()

    const frames = SAMPLE_RATE * 3
    const samples = noise(frames, 7)
    pushed!.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: frames }, sampleRate: SAMPLE_RATE, channels: [samples] })
    await expect.poll(() => published.length).toBeGreaterThan(60)
    controller.abort('done')

    // The same noise, one level for each 33 ms hop of a 40 ms window, without the mean.
    const single: number[] = []
    for (let start = 0; start + 1920 <= frames; start += 1584)
      single.push(bandLevelsOf([samples.subarray(start, start + 1920)], SAMPLE_RATE)[1])
    const averaged = published.slice(4).map(levels => levels[1])

    expect(standardDeviation(averaged)).toBeLessThan(standardDeviation(single) * 0.7)
  })
})
