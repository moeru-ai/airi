import { errorMessageFrom } from '@moeru/std'
import { toWav } from '@proj-airi/audio/encoding'
import { mimoAsrAudioFormat } from '@proj-airi/provider-inference'

/** Preserves valid WAV/MP3 bytes and decodes other upload containers at the browser boundary. */
export async function prepareMimoAsrUpload(file: File): Promise<File> {
  const bytes = await file.arrayBuffer()
  if (mimoAsrAudioFormat(bytes))
    return file

  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(bytes)
    const samples = new Float32Array(decoded.length)
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const source = decoded.getChannelData(channel)
      for (let index = 0; index < decoded.length; index++)
        samples[index] += source[index] / decoded.numberOfChannels
    }
    return new File([toWav(samples.buffer, decoded.sampleRate)], 'recording.wav', { type: 'audio/wav' })
  }
  catch (error) {
    throw new Error(`Unable to convert recorder audio to a MiMo-compatible WAV file: ${errorMessageFrom(error) ?? 'unknown decode error'}`)
  }
  finally {
    await context.close()
  }
}
