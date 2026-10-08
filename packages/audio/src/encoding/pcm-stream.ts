import type { create } from '@alexanderolsen/libsamplerate-js'
import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { toPCM16FromFloat32 } from './wav'

/** Converts accepted PCM to mono PCM16 bytes. Each reader pull advances conversion without collecting the complete recording. */
export class Pcm16Encoder {
  readonly stream: ReadableStream<Uint8Array>
  private readonly reader: ReadableStreamDefaultReader<PcmBlock>
  private converter: Awaited<ReturnType<typeof create>> | undefined
  private inputRate: number | undefined
  private inputFrames = 0
  private outputFrames = 0
  private ended = false
  private closed = false
  private output: ReadableStreamDefaultController<Uint8Array> | undefined

  constructor(frames: ReadableStream<PcmBlock>, private readonly options: { sampleRate: number, signal?: AbortSignal }) {
    if (!Number.isFinite(options.sampleRate) || options.sampleRate <= 0)
      throw new Error('PCM output sample rate must be positive')
    this.reader = frames.getReader()
    this.stream = new ReadableStream<Uint8Array>({
      start: (output) => {
        this.output = output
        options.signal?.addEventListener('abort', this.abort, { once: true })
        if (options.signal?.aborted)
          this.abort()
      },
      pull: output => this.pull(output),
      cancel: reason => this.cancel(reason),
    })
  }

  /** Triggering workflow: encoded stream reader → source PCM → mono resampling → provider upload bytes. */
  private async pull(output: ReadableStreamDefaultController<Uint8Array>) {
    try {
      while (!this.closed) {
        if (this.ended) {
          const remaining = Math.floor(this.inputFrames * this.options.sampleRate / this.inputRate!) - this.outputFrames
          if (remaining > 0 && this.converter) {
            // NOTICE:
            // Zero extension drains filter delay without extending the accepted duration.
            // The wrapper does not expose libsamplerate's end_of_input flag.
            // Source: @alexanderolsen/libsamplerate-js/dist/module-type.d.ts, ModuleType.full.
            // Removal condition: the wrapper exposes an explicit final-input operation.
            const tail = this.converter.full(new Float32Array(Math.max(1, Math.ceil(remaining * this.inputRate! / this.options.sampleRate))))
            if (tail.length) {
              this.emit(tail.subarray(0, remaining), output)
              return
            }
            continue
          }
          output.close()
          this.release()
          return
        }
        const result = await this.reader.read()
        if (this.closed)
          return
        if (result.done) {
          this.ended = true
          continue
        }
        const block = result.value
        if (this.inputRate !== undefined && this.inputRate !== block.sampleRate)
          throw new Error('PCM sample rate changed during transcription')
        if (!block.channels.length || block.channels.some(channel => channel.length !== block.channels[0].length))
          throw new Error('Invalid PCM channel lengths')
        if (this.inputRate === undefined) {
          this.inputRate = block.sampleRate
          if (this.inputRate !== this.options.sampleRate) {
            const { create, ConverterType } = await import('@alexanderolsen/libsamplerate-js')
            this.converter = await create(1, this.inputRate, this.options.sampleRate, { converterType: ConverterType.SRC_SINC_FASTEST })
            if (this.closed) {
              this.converter.destroy()
              return
            }
          }
        }
        const mono = new Float32Array(block.channels[0].length)
        for (const channel of block.channels) {
          for (let index = 0; index < mono.length; index++)
            mono[index] += channel[index] / block.channels.length
        }
        this.inputFrames += mono.length
        const converted = this.converter ? this.converter.full(mono) : mono
        if (converted.length) {
          this.emit(converted, output)
          return
        }
      }
    }
    catch (error) {
      if (!this.closed)
        output.error(error)
      await this.cancel(error)
    }
  }

  private emit(samples: Float32Array, output: ReadableStreamDefaultController<Uint8Array>) {
    this.outputFrames += samples.length
    output.enqueue(toPCM16FromFloat32(samples))
  }

  private readonly abort = () => {
    if (!this.closed)
      this.output?.error(this.options.signal?.reason)
    void this.cancel(this.options.signal?.reason)
  }

  private async cancel(reason: unknown) {
    if (this.closed)
      return
    this.closed = true
    try {
      // A source that already errored rejects the cancel with its stored error. It has nothing left to release.
      // The abort handler cannot await this, so a rejection here was unhandled when a speech input was cancelled.
      await this.reader.cancel(reason).catch(() => {})
    }
    finally {
      this.release()
    }
  }

  private release() {
    this.closed = true
    this.options.signal?.removeEventListener('abort', this.abort)
    this.converter?.destroy()
    this.converter = undefined
    this.reader.releaseLock()
  }
}
