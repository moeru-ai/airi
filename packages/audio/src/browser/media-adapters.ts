import type { FileOptions, MediaAdapters, PcmBlock } from '@proj-airi/pipelines-audio'

import { toWav } from '../encoding'
import { AudioOutput } from './audio-output'

/** Uses the existing WAV encoder. File resampling happens only after the capture stream closes. */
export class BrowserMediaAdapters implements MediaAdapters {
  constructor(private readonly context: AudioContext) {}

  supportsFile(options: FileOptions): boolean {
    return options.mimeType === 'audio/wav' && Number.isFinite(options.sampleRate) && options.sampleRate > 0 && (options.channels === 1 || options.channels === 2)
  }

  async encode(frames: ReadableStream<PcmBlock>, options: FileOptions, signal: AbortSignal): Promise<Blob> {
    if (!this.supportsFile(options))
      throw new Error('Unsupported audio file format')
    const reader = frames.getReader()
    const blocks: PcmBlock[] = []
    const abort = () => {
      void reader.cancel(signal.reason).catch(() => {})
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      signal.throwIfAborted()
      while (true) {
        const result = await reader.read()
        signal.throwIfAborted()
        if (result.done)
          break
        blocks.push(result.value)
      }
      const length = blocks.reduce((sum, block) => sum + block.channels[0].length, 0)
      if (!length)
        return new Blob([toWav(new ArrayBuffer(0), options.sampleRate, options.channels)], { type: options.mimeType })
      const input = new AudioBuffer({ numberOfChannels: blocks[0].channels.length, length, sampleRate: blocks[0].sampleRate })
      let offset = 0
      for (const block of blocks) {
        block.channels.forEach((channel, index) => input.copyToChannel(new Float32Array(channel), index, offset))
        offset += block.channels[0].length
      }
      const offline = new OfflineAudioContext(options.channels, Math.max(1, Math.round(length * options.sampleRate / input.sampleRate)), options.sampleRate)
      const source = offline.createBufferSource()
      source.buffer = input
      source.connect(offline.destination)
      source.start()
      const output = await offline.startRendering()
      signal.throwIfAborted()
      const interleaved = new Float32Array(output.length * output.numberOfChannels)
      for (let channel = 0; channel < output.numberOfChannels; channel++) {
        const values = output.getChannelData(channel)
        for (let frame = 0; frame < output.length; frame++)
          interleaved[frame * output.numberOfChannels + channel] = values[frame]
      }
      return new Blob([toWav(interleaved.buffer, options.sampleRate, options.channels)], { type: options.mimeType })
    }
    finally {
      signal.removeEventListener('abort', abort)
      reader.releaseLock()
    }
  }

  nativeStream(frames: ReadableStream<PcmBlock>, signal: AbortSignal): { media: MediaStream, done: Promise<void> } {
    const destination = this.context.createMediaStreamDestination()
    const output = new AudioOutput(this.context, frames, destination)
    const abort = () => {
      void output.stop({ fadeMs: 0 }).catch(() => {})
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted)
      abort()
    const done = output.done.then(() => {
      signal.throwIfAborted()
    }).finally(() => {
      signal.removeEventListener('abort', abort)
      destination.disconnect()
      destination.stream.getTracks().forEach(track => track.stop())
    })
    return { media: destination.stream, done }
  }
}
