import { microphoneSource } from '@proj-airi/audio/browser'
import { Pcm16Encoder, toFloat32FromPCM16 } from '@proj-airi/audio/encoding'

/**
 * Microphone blocks at `sampleRate`, without echo cancellation, noise suppression, or gain control,
 * so the probe sees the raw input. An abort of `signal` ends the input and closes the microphone.
 */
export async function* microphoneChunks(sampleRate: number, signal: AbortSignal): AsyncGenerator<Float32Array<ArrayBuffer>> {
  if (signal.aborted)
    return
  // An abort of the connection signal errors the stream. Cancelling the reader ends it normally.
  const connection = new AbortController()
  const reader = new Pcm16Encoder(
    microphoneSource({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).open(connection.signal),
    { sampleRate, signal: connection.signal },
  ).stream.getReader()
  const cancel = () => void reader.cancel()
  signal.addEventListener('abort', cancel, { once: true })
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done)
        return
      yield toFloat32FromPCM16(value)
    }
  }
  finally {
    signal.removeEventListener('abort', cancel)
    cancel()
  }
}

/** Plays `samples` as live input: one block of 100 ms each 100 ms. An abort of `signal` ends the input. */
export async function* replayChunks(samples: Float32Array, sampleRate: number, signal: AbortSignal): AsyncGenerator<Float32Array<ArrayBuffer>> {
  const block = Math.round(sampleRate / 10)
  const startedAt = performance.now()
  for (let start = 0; start < samples.length && !signal.aborted; start += block) {
    const dueAt = startedAt + start / sampleRate * 1000
    await new Promise(resolve => setTimeout(resolve, Math.max(0, dueAt - performance.now())))
    if (signal.aborted)
      return
    yield samples.slice(start, start + block)
  }
}
