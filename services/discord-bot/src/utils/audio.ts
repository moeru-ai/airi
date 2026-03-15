import { Buffer } from 'node:buffer'

import { DECODE_SAMPLE_RATE } from '../constants/audio'

export function getWavHeader(
  audioLength: number,
  sampleRate: number,
  channelCount: number = 1,
  bitsPerSample: number = 16,
): Buffer {
  const wavHeader = Buffer.alloc(44)
  wavHeader.write('RIFF', 0)
  wavHeader.writeUInt32LE(36 + audioLength, 4) // Length of entire file in bytes minus 8
  wavHeader.write('WAVE', 8)
  wavHeader.write('fmt ', 12)
  wavHeader.writeUInt32LE(16, 16) // Length of format data
  wavHeader.writeUInt16LE(1, 20) // Type of format (1 is PCM)
  wavHeader.writeUInt16LE(channelCount, 22) // Number of channels
  wavHeader.writeUInt32LE(sampleRate, 24) // Sample rate
  wavHeader.writeUInt32LE(
    (sampleRate * bitsPerSample * channelCount) / 8,
    28,
  ) // Byte rate
  wavHeader.writeUInt16LE((bitsPerSample * channelCount) / 8, 32) // Block align ((BitsPerSample * Channels) / 8)
  wavHeader.writeUInt16LE(bitsPerSample, 34) // Bits per sample
  wavHeader.write('data', 36) // Data chunk header
  wavHeader.writeUInt32LE(audioLength, 40) // Data chunk size
  return wavHeader
}

export function convertOpusToWav(pcmBuffer: Buffer): Buffer {
  try {
    // Generate the WAV header
    const wavHeader = getWavHeader(
      pcmBuffer.length,
      DECODE_SAMPLE_RATE,
    )

    // Concatenate the WAV header and PCM data
    const wavBuffer = Buffer.concat([wavHeader, pcmBuffer])

    return wavBuffer
  }
  catch (error) {
    console.error('Error converting PCM to WAV:', error)
    throw error
  }
}
