import { encodeBase64 } from '@moeru/std/base64'

function writeString(dataView: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    dataView.setUint8(offset + i, string.charCodeAt(i))
  }
}

function createWavBuffer(dataSize: number, sampleRate: number, channel: number): ArrayBuffer {
  const bitsPerSample = 16
  const byteRate = sampleRate * channel * (bitsPerSample / 8)
  const blockAlign = channel * (bitsPerSample / 8)
  const arrayBuffer = new ArrayBuffer(44 + dataSize)
  const dataView = new DataView(arrayBuffer)

  writeString(dataView, 0, 'RIFF')
  dataView.setUint32(4, 36 + dataSize, true)
  writeString(dataView, 8, 'WAVE')

  writeString(dataView, 12, 'fmt ')
  dataView.setUint32(16, 16, true)
  dataView.setUint16(20, 1, true)
  dataView.setUint16(22, channel, true)
  dataView.setUint32(24, sampleRate, true)
  dataView.setUint32(28, byteRate, true)
  dataView.setUint16(32, blockAlign, true)
  dataView.setUint16(34, bitsPerSample, true)

  writeString(dataView, 36, 'data')
  dataView.setUint32(40, dataSize, true)

  return arrayBuffer
}

/**
 * Encodes Float32 samples as a WAV file.
 *
 * @example
 * toWav(float32Samples.buffer, 24000)
 * // => WAV data with converted PCM16 samples
 */
export function toWav(buffer: ArrayBufferLike, sampleRate: number, channel = 1): ArrayBuffer {
  const samples = new Float32Array(buffer)
  const arrayBuffer = createWavBuffer(samples.length * 2, sampleRate, channel)
  const dataView = new DataView(arrayBuffer)

  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
    dataView.setInt16(44 + i * 2, value, true)
  }

  return arrayBuffer
}

/**
 * Wraps raw signed 16-bit PCM samples in a WAV file.
 *
 * @example
 * toWavFromPCM16(pcmBytes, 24000)
 * // => WAV data with the original PCM16 bytes
 */
export function toWavFromPCM16(pcmBytes: Uint8Array, sampleRate: number, channel = 1): ArrayBuffer {
  const arrayBuffer = createWavBuffer(pcmBytes.byteLength, sampleRate, channel)
  new Uint8Array(arrayBuffer, 44).set(pcmBytes)
  return arrayBuffer
}

export function toWAVBase64(buffer: ArrayBufferLike, sampleRate: number) {
  return encodeBase64(toWav(buffer, sampleRate))
}
