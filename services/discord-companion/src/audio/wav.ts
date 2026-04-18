import { Buffer } from 'node:buffer'

import { DECODE_CHANNELS, DECODE_SAMPLE_RATE } from './constants'

/**
 * Builds a 44-byte little-endian PCM WAV header for the given payload.
 *
 * Use when:
 * - Wrapping raw PCM data into a WAV file for transmission to an STT provider.
 *
 * Expects:
 * - `audioLength` in bytes, matching the raw PCM payload length.
 * - `sampleRate`, `channelCount`, and `bitsPerSample` matching the PCM payload.
 *
 * Returns:
 * - A 44-byte Buffer containing a valid WAV/RIFF header.
 */
export function getWavHeader(
  audioLength: number,
  sampleRate: number = DECODE_SAMPLE_RATE,
  channelCount: number = DECODE_CHANNELS,
  bitsPerSample: number = 16,
): Buffer {
  const wavHeader = Buffer.alloc(44)
  wavHeader.write('RIFF', 0)
  wavHeader.writeUInt32LE(36 + audioLength, 4)
  wavHeader.write('WAVE', 8)
  wavHeader.write('fmt ', 12)
  wavHeader.writeUInt32LE(16, 16)
  wavHeader.writeUInt16LE(1, 20)
  wavHeader.writeUInt16LE(channelCount, 22)
  wavHeader.writeUInt32LE(sampleRate, 24)
  wavHeader.writeUInt32LE((sampleRate * bitsPerSample * channelCount) / 8, 28)
  wavHeader.writeUInt16LE((bitsPerSample * channelCount) / 8, 32)
  wavHeader.writeUInt16LE(bitsPerSample, 34)
  wavHeader.write('data', 36)
  wavHeader.writeUInt32LE(audioLength, 40)
  return wavHeader
}

/**
 * Wraps raw PCM bytes with a WAV header producing a self-contained WAV buffer.
 *
 * Use when:
 * - Handing PCM output from the Opus decoder to STT providers that expect `audio/wav`.
 *
 * Before:
 * - Raw PCM bytes (no header).
 *
 * After:
 * - A Buffer whose first 44 bytes are the WAV header followed by the original PCM payload.
 */
export function pcmToWav(
  pcm: Buffer,
  sampleRate: number = DECODE_SAMPLE_RATE,
  channels: number = DECODE_CHANNELS,
  bitsPerSample: number = 16,
): Buffer {
  const header = getWavHeader(pcm.length, sampleRate, channels, bitsPerSample)
  return Buffer.concat([header, pcm], header.length + pcm.length)
}
