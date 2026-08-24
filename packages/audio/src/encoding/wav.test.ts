import { describe, expect, it } from 'vitest'

import { toWav, toWavFromPCM16 } from './wav'

describe('toWav', () => {
  it('converts Float32 samples to PCM16 bytes by default', () => {
    const samples = new Float32Array([-1, 0, 1])
    const wav = toWav(samples.buffer, 24000)
    const view = new DataView(wav)

    expect(view.getInt16(44, true)).toBe(-32768)
    expect(view.getInt16(46, true)).toBe(0)
    expect(view.getInt16(48, true)).toBe(32767)
  })

  it('preserves PCM16 bytes and writes the WAV metadata', () => {
    const pcmBytes = new Uint8Array([0x00, 0x80, 0xFF, 0x7F])
    const wav = toWavFromPCM16(pcmBytes, 24000)
    const view = new DataView(wav)

    expect(new TextDecoder().decode(new Uint8Array(wav, 0, 4))).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(40)
    expect(new TextDecoder().decode(new Uint8Array(wav, 8, 4))).toBe('WAVE')
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(24000)
    expect(view.getUint32(28, true)).toBe(48000)
    expect(view.getUint16(32, true)).toBe(2)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(pcmBytes.byteLength)
    expect([...new Uint8Array(wav, 44)]).toEqual([...pcmBytes])
  })
})
