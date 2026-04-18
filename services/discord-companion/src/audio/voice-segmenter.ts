import type { Readable } from 'node:stream'

import { Buffer } from 'node:buffer'

import { useLogg } from '@guiiai/logg'

const log = useLogg('VoiceSegmenter').useGlobalConfig()

export interface VoiceSegmenterOptions {
  /**
   * Maximum amount of PCM bytes to keep in the rolling buffer.
   *
   * @default 10_000_000
   */
  maxBufferBytes?: number
}

export interface VoiceSegmenterHandlers {
  /**
   * Called when a new speaking segment starts (i.e. the user just started speaking).
   */
  onStart: () => void
  /**
   * Called when a speaking segment completes (speakingStopped / end).
   * Receives the full PCM buffer captured between `onStart` and this event.
   */
  onSegment: (pcm: Buffer) => void | Promise<void>
}

/**
 * Collects PCM chunks from an Opus-decoded audio stream into speech segments
 * bounded by `speakingStarted` / `speakingStopped` events emitted by the
 * upstream decoder / receiver.
 *
 * Use when:
 * - Buffering a single user's audio to feed a speech-to-text pipeline.
 *
 * Expects:
 * - `stream` is a Readable that emits `data` Buffers plus custom
 *   `speakingStarted` / `speakingStopped` events (see
 *   `discord.js`'s voice receiver wired through {@link OpusDecoder}).
 *
 * Returns:
 * - A `stop` function that removes all listeners registered by the segmenter.
 *
 * NOTICE:
 * Based on the pattern from eliza's `client-discord/src/voice.ts` plus the
 * existing `services/discord-bot/src/utils/audio-monitor.ts` — rewritten as a
 * small functional helper so it is easier to mock in tests.
 */
export function createVoiceSegmenter(
  stream: Readable,
  handlers: VoiceSegmenterHandlers,
  options: VoiceSegmenterOptions = {},
): { stop: () => void } {
  const maxBufferBytes = options.maxBufferBytes ?? 10_000_000

  let buffers: Buffer[] = []
  let bufferedBytes = 0
  let speaking = false
  let ended = false

  const resetBuffer = () => {
    buffers = []
    bufferedBytes = 0
  }

  const drainBuffer = async () => {
    if (!buffers.length)
      return

    const payload = Buffer.concat(buffers, bufferedBytes)
    resetBuffer()
    try {
      await handlers.onSegment(payload)
    }
    catch (error) {
      log.withError(error).error('onSegment handler threw')
    }
  }

  const onData = (chunk: Buffer) => {
    buffers.push(chunk)
    bufferedBytes += chunk.length

    while (bufferedBytes > maxBufferBytes && buffers.length > 0) {
      const dropped = buffers.shift()
      if (dropped) {
        bufferedBytes -= dropped.length
      }
    }
  }

  const onSpeakingStarted = () => {
    if (ended)
      return
    speaking = true
    resetBuffer()
    handlers.onStart()
  }

  const onSpeakingStopped = () => {
    if (ended || !speaking)
      return
    speaking = false
    void drainBuffer()
  }

  const onEnd = () => {
    if (ended)
      return
    ended = true
    if (speaking) {
      speaking = false
      void drainBuffer()
    }
  }

  stream.on('data', onData)
  stream.on('end', onEnd)
  stream.on('speakingStarted', onSpeakingStarted)
  stream.on('speakingStopped', onSpeakingStopped)

  return {
    stop: () => {
      stream.off('data', onData)
      stream.off('end', onEnd)
      stream.off('speakingStarted', onSpeakingStarted)
      stream.off('speakingStopped', onSpeakingStopped)
    },
  }
}
