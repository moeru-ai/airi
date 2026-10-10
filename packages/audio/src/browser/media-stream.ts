import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { createScope } from '@proj-airi/pipelines-audio'

import { AudioOutput } from './audio-output'

/**
 * Plays PCM into a new MediaStream for APIs that only accept tracks, such as Web Speech recognition.
 *
 * `done` resolves after the PCM stream ends and its audio has played. Aborting `signal` stops output
 * immediately. The returned tracks belong to this call and stop when it settles.
 */
export function toMediaStream(frames: ReadableStream<PcmBlock>, context: AudioContext, signal?: AbortSignal): { media: MediaStream, done: Promise<void> } {
  const scope = createScope(signal)
  const destination = context.createMediaStreamDestination()
  const output = new AudioOutput(context, frames, destination)
  scope.defer(() => output.stop({ fadeMs: 0 }).catch(() => {}))
  const done = output.done.then(() => scope.signal.throwIfAborted()).finally(() => {
    void scope.close('Media stream output ended')
    destination.disconnect()
    destination.stream.getTracks().forEach(track => track.stop())
  })
  return { media: destination.stream, done }
}
