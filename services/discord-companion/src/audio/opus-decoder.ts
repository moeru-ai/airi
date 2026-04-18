import { Buffer } from 'node:buffer'
import { Transform } from 'node:stream'

import OpusScript from 'opusscript'

export type OpusSupportedSampleRate = 8000 | 12000 | 16000 | 24000 | 48000

/**
 * Streaming Opus decoder that turns raw Opus packets from Discord voice receivers
 * into 16-bit PCM chunks.
 *
 * Use when:
 * - Piping `connection.receiver.subscribe(userId)` output into a downstream
 *   audio monitor or file sink.
 *
 * Expects:
 * - Input chunks are raw Opus frames (as produced by discord.js voice receivers).
 *
 * Returns:
 * - PCM audio buffers of the configured `sampleRate` / `channels`.
 *
 * NOTICE:
 * We subclass `node:stream`'s Transform here because opusscript exposes a
 * synchronous `decode` API and Node.js stream is the most natural way to pipe
 * incoming audio packets. This follows the same pattern as the legacy
 * `services/discord-bot/src/utils/opus.ts`.
 */
export class OpusDecoder extends Transform {
  private decoder: OpusScript

  constructor(sampleRate: OpusSupportedSampleRate, channels: number) {
    super()
    this.decoder = new OpusScript(sampleRate, channels)
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    try {
      const pcm = this.decoder.decode(chunk)
      if (pcm) {
        this.push(Buffer.from(pcm))
      }
      callback()
    }
    catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      this.emit('error', normalized)
      callback(normalized)
    }
  }

  _flush(callback: () => void) {
    callback()
  }
}
