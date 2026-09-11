import { describe, expect, it } from 'vitest'

import { toFloat32FromPCM16, toPCM16FromFloat32, toWav, toWavFromPCM16 } from './wav'

describe('pcm sample encoding', () => {
  it('converts normalized Float32 samples to little-endian PCM16 bytes', () => {
    const samples = new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2])
    const pcmBytes = toPCM16FromFloat32(samples)
    const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength)

    expect(view.getInt16(0, true)).toBe(-32768)
    expect(view.getInt16(2, true)).toBe(-32768)
    expect(view.getInt16(4, true)).toBe(-16384)
    expect(view.getInt16(6, true)).toBe(0)
    expect(view.getInt16(8, true)).toBe(16383)
    expect(view.getInt16(10, true)).toBe(32767)
    expect(view.getInt16(12, true)).toBe(32767)
  })

  it('converts little-endian PCM16 bytes to normalized Float32 samples', () => {
    const pcmBytes = new Uint8Array(10)
    const view = new DataView(pcmBytes.buffer)
    view.setInt16(0, -32768, true)
    view.setInt16(2, -16384, true)
    view.setInt16(4, 0, true)
    view.setInt16(6, 16384, true)
    view.setInt16(8, 32767, true)

    expect([...toFloat32FromPCM16(pcmBytes)]).toEqual([
      -1,
      -0.5,
      0,
      0.5,
      32767 / 32768,
    ])
  })

  it('rejects incomplete PCM16 samples', () => {
    expect(() => toFloat32FromPCM16(new Uint8Array([0]))).toThrow(
      'PCM16 input must contain complete 16-bit samples.',
    )
  })
})

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
