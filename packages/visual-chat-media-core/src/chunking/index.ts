import { Buffer } from 'node:buffer'

import { AUDIO_CHUNK_BYTES, AUDIO_SAMPLE_RATE } from '@proj-airi/visual-chat-protocol'

/**
 * Creates a WAV file buffer from 16-bit PCM mono audio data.
 * llama.cpp-omni requires 16kHz mono WAV, exactly 1 second per chunk.
 */
export function pcmToWav(pcmData: Buffer): Buffer {
  const wavHeaderSize = 44
  const dataSize = pcmData.length
  const fileSize = wavHeaderSize + dataSize
  const wav = Buffer.alloc(fileSize)

  // RIFF header
  wav.write('RIFF', 0)
  wav.writeUInt32LE(fileSize - 8, 4)
  wav.write('WAVE', 8)

  // fmt chunk
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16) // chunk size
  wav.writeUInt16LE(1, 20) // PCM format
  wav.writeUInt16LE(1, 22) // mono
  wav.writeUInt32LE(AUDIO_SAMPLE_RATE, 24) // sample rate
  wav.writeUInt32LE(AUDIO_SAMPLE_RATE * 2, 28) // byte rate (16-bit mono)
  wav.writeUInt16LE(2, 32) // block align
  wav.writeUInt16LE(16, 34) // bits per sample

  // data chunk
  wav.write('data', 36)
  wav.writeUInt32LE(dataSize, 40)
  pcmData.copy(wav, 44)

  return wav
}

/**
 * Generates a 1-second silent WAV at 16kHz mono.
 * Used when no audio input is available.
 */
export function generateSilentWav(): Buffer {
  const silentPcm = Buffer.alloc(AUDIO_CHUNK_BYTES)
  return pcmToWav(silentPcm)
}

/**
 * Validates that a PCM buffer is exactly 1 second at 16kHz 16-bit mono.
 */
export function isValidAudioChunk(data: Buffer): boolean {
  return data.length === AUDIO_CHUNK_BYTES
}

/**
 * Pads or trims PCM data to exactly 1 second.
 */
export function normalizeAudioChunk(data: Buffer): Buffer {
  if (data.length === AUDIO_CHUNK_BYTES)
    return data

  if (data.length > AUDIO_CHUNK_BYTES)
    return data.subarray(0, AUDIO_CHUNK_BYTES)

  const padded = Buffer.alloc(AUDIO_CHUNK_BYTES)
  data.copy(padded)
  return padded
}
