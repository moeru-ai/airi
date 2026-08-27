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
 * Converts normalized Float32 PCM samples to little-endian signed PCM16 bytes.
 * Values outside the normalized range are clamped.
 *
 * @example
 * toPCM16FromFloat32(new Float32Array([-1, 0, 1]))
 * // => Uint8Array([0, 128, 0, 0, 255, 127])
 */
export function toPCM16FromFloat32(samples: Float32Array): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(samples.length * Int16Array.BYTES_PER_ELEMENT)
  const dataView = new DataView(output.buffer)

  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
    dataView.setInt16(i * Int16Array.BYTES_PER_ELEMENT, value, true)
  }

  return output
}

/**
 * Converts little-endian signed PCM16 bytes to normalized Float32 PCM samples.
 *
 * @example
 * toFloat32FromPCM16(new Uint8Array([0, 128, 0, 0, 255, 127]))
 * // => Float32Array([-1, 0, 0.999969482421875])
 */
export function toFloat32FromPCM16(pcmBytes: Uint8Array): Float32Array<ArrayBuffer> {
  if (pcmBytes.byteLength % Int16Array.BYTES_PER_ELEMENT !== 0)
    throw new TypeError('PCM16 input must contain complete 16-bit samples.')

  const dataView = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength)
  const output = new Float32Array(pcmBytes.byteLength / Int16Array.BYTES_PER_ELEMENT)

  for (let i = 0; i < output.length; i++)
    output[i] = dataView.getInt16(i * Int16Array.BYTES_PER_ELEMENT, true) / 0x8000

  return output
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
  return toWavFromPCM16(toPCM16FromFloat32(samples), sampleRate, channel)
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
