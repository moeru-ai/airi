const WHISPER_SAMPLE_RATE = 16_000

/**
 * Linearly resamples a mono PCM buffer.
 *
 * Before:
 * - Float32 samples at `fromRate`
 *
 * After:
 * - Float32 samples at `toRate`
 */
export function resampleMonoLinear(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || samples.length === 0)
    return samples

  const ratio = fromRate / toRate
  const newLength = Math.max(1, Math.round(samples.length / ratio))
  const output = new Float32Array(newLength)

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio
    const left = Math.floor(srcIndex)
    const right = Math.min(left + 1, samples.length - 1)
    const frac = srcIndex - left
    output[i] = samples[left]! * (1 - frac) + samples[right]! * frac
  }

  return output
}

/**
 * Decodes an audio file into mono Float32 PCM for Whisper.
 *
 * Before:
 * - Encoded audio `File` / `Blob` (wav/mp3/webm/…)
 *
 * After:
 * - Mono Float32Array at 16 kHz suitable for `audioFloat32` Whisper input
 */
export async function decodeAudioFileToMonoFloat32(
  file: Blob,
  targetSampleRate = WHISPER_SAMPLE_RATE,
): Promise<Float32Array> {
  const audioContext = new AudioContext()
  try {
    const arrayBuffer = await file.arrayBuffer()
    // decodeAudioData detaches the buffer in some engines; pass a copy.
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0))
    const length = audioBuffer.length
    const channelCount = audioBuffer.numberOfChannels
    const mono = new Float32Array(length)

    for (let channel = 0; channel < channelCount; channel++) {
      const data = audioBuffer.getChannelData(channel)
      for (let i = 0; i < length; i++)
        mono[i]! += data[i]! / channelCount
    }

    return resampleMonoLinear(mono, audioBuffer.sampleRate, targetSampleRate)
  }
  finally {
    await audioContext.close()
  }
}

export { WHISPER_SAMPLE_RATE }
