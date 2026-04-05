import { AUDIO_CHUNK_BYTES } from '@proj-airi/visual-chat-protocol'
import { describe, expect, it } from 'vitest'

import { generateSilentWav, isValidAudioChunk, normalizeAudioChunk, pcmToWav } from '.'

describe('chunking', () => {
  it('pcmToWav should produce valid WAV header', () => {
    const pcm = Buffer.alloc(AUDIO_CHUNK_BYTES)
    const wav = pcmToWav(pcm)

    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ')
    expect(wav.readUInt16LE(20)).toBe(1) // PCM format
    expect(wav.readUInt16LE(22)).toBe(1) // mono
    expect(wav.readUInt32LE(24)).toBe(16000) // sample rate
    expect(wav.readUInt16LE(34)).toBe(16) // bits per sample
    expect(wav.toString('ascii', 36, 40)).toBe('data')
    expect(wav.readUInt32LE(40)).toBe(AUDIO_CHUNK_BYTES) // data size
    expect(wav.length).toBe(44 + AUDIO_CHUNK_BYTES)
  })

  it('generateSilentWav should produce a valid WAV of silence', () => {
    const wav = generateSilentWav()
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.length).toBe(44 + AUDIO_CHUNK_BYTES)

    const dataSection = wav.subarray(44)
    const allZero = dataSection.every(b => b === 0)
    expect(allZero).toBe(true)
  })

  it('isValidAudioChunk should validate chunk size', () => {
    expect(isValidAudioChunk(Buffer.alloc(AUDIO_CHUNK_BYTES))).toBe(true)
    expect(isValidAudioChunk(Buffer.alloc(100))).toBe(false)
    expect(isValidAudioChunk(Buffer.alloc(AUDIO_CHUNK_BYTES + 1))).toBe(false)
  })

  it('normalizeAudioChunk should pad short data', () => {
    const short = Buffer.alloc(100, 0xAB)
    const normalized = normalizeAudioChunk(short)
    expect(normalized.length).toBe(AUDIO_CHUNK_BYTES)
    expect(normalized[0]).toBe(0xAB)
    expect(normalized[100]).toBe(0) // padded with zeros
  })

  it('normalizeAudioChunk should trim long data', () => {
    const long = Buffer.alloc(AUDIO_CHUNK_BYTES + 500, 0xCD)
    const normalized = normalizeAudioChunk(long)
    expect(normalized.length).toBe(AUDIO_CHUNK_BYTES)
  })

  it('normalizeAudioChunk should pass through exact size', () => {
    const exact = Buffer.alloc(AUDIO_CHUNK_BYTES, 0xFF)
    const normalized = normalizeAudioChunk(exact)
    expect(normalized).toBe(exact) // same reference
  })
})
