import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { getWavHeader, pcmToWav } from '../src/audio/wav'

/**
 * @example
 * getWavHeader(16).readUInt32LE(4) === 52
 */
describe('getWavHeader', () => {
  it('produces a 44-byte header with RIFF/WAVE markers', () => {
    const header = getWavHeader(0)

    expect(header.length).toBe(44)
    expect(header.toString('ascii', 0, 4)).toBe('RIFF')
    expect(header.toString('ascii', 8, 12)).toBe('WAVE')
    expect(header.toString('ascii', 36, 40)).toBe('data')
  })

  it('writes total file size at offset 4 (36 + audioLength)', () => {
    const header = getWavHeader(16)

    expect(header.readUInt32LE(4)).toBe(52)
    expect(header.readUInt32LE(40)).toBe(16)
  })

  it('encodes the default 16kHz mono 16-bit format', () => {
    const header = getWavHeader(0)

    expect(header.readUInt16LE(20)).toBe(1)
    expect(header.readUInt16LE(22)).toBe(1)
    expect(header.readUInt32LE(24)).toBe(16000)
    expect(header.readUInt16LE(34)).toBe(16)
  })
})

/**
 * @example
 * pcmToWav(Buffer.from([0, 0])).length === 46
 */
describe('pcmToWav', () => {
  it('prepends the WAV header to the PCM payload', () => {
    const pcm = Buffer.from([1, 2, 3, 4])

    const wav = pcmToWav(pcm)

    expect(wav.length).toBe(44 + pcm.length)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.subarray(44).equals(pcm)).toBe(true)
  })
})
