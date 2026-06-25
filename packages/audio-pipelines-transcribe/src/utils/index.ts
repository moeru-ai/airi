import { tryCatch } from '@moeru/std'

/**
 * Decodes an audio file into a playable {@link MediaStream}.
 *
 * Use this when browser transcription code needs to feed file-backed audio
 * into APIs that consume live media streams. The returned cleanup function
 * stops the one-shot buffer source and releases the owned {@link AudioContext}.
 */
export async function mediaStreamFromAudioFile(file: File): Promise<{
  cleanup: () => Promise<void>
  stream: MediaStream
}> {
  const audioContext = new AudioContext()
  const arrayBuffer = await file.arrayBuffer()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

  const source = audioContext.createBufferSource()
  source.buffer = audioBuffer

  const destination = audioContext.createMediaStreamDestination()
  source.connect(destination)
  source.connect(audioContext.destination)

  source.start(0)
  await tryCatch(async () => {
    await audioContext.resume()
  })

  return {
    stream: destination.stream,
    cleanup: async () => {
      try {
        source.stop()
      }
      catch {
        // `AudioBufferSourceNode.stop()` throws if playback already ended or
        // was stopped by the caller; cleanup should remain idempotent.
      }
      source.disconnect()
      destination.disconnect()
      for (const track of destination.stream.getTracks()) {
        track.stop()
      }
      await audioContext.close()
    },
  }
}
