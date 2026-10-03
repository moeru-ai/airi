import type { AudioInput, AudioInputSource, PcmBlock } from '@proj-airi/pipelines-audio'
import type { Mock } from 'vitest'

import { vi } from 'vitest'

/**
 * Wraps a test-driven PCM stream as a source. `close` runs when the input releases the connection.
 *
 * The stream can serve one connection. Tests that reopen a source create a new stream.
 *
 * @example
 * const frames = createPushStream<PcmBlock>()
 * const input = new AudioInput(pcmSource(frames.stream))
 */
export function pcmSource(frames: ReadableStream<PcmBlock>, close: () => unknown = () => {}): AudioInputSource & { readonly open: Mock<AudioInputSource['open']> } {
  return {
    open: vi.fn((signal: AbortSignal) => {
      signal.addEventListener('abort', () => void close(), { once: true })
      return frames
    }),
  }
}

/**
 * Keeps an input connected, as a running detector would. Returns the function that releases it.
 *
 * @example
 * const release = keepOpen(input)
 * release()
 */
export function keepOpen(input: AudioInput): () => void {
  const subscription = new AbortController()
  void input.subscribe({ signal: subscription.signal }).pipeTo(new WritableStream()).catch(() => {})
  return () => subscription.abort()
}
