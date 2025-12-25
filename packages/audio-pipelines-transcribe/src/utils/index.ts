import { tryCatch } from '@moeru/std'

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

      catch { /* noop */ }
      source.disconnect()
      destination.disconnect()
      await audioContext.close()
    },
  }
}
