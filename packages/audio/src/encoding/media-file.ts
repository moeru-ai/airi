import type { AudioInputSource, PcmBlock } from '@proj-airi/pipelines-audio'

import { ALL_FORMATS, AudioSample, AudioSampleSink, AudioSampleSource, BlobSource, BufferTarget, Input, Output, WavOutputFormat } from 'mediabunny'

/** Output format for {@link encodeWav}. Providers usually expect 16 kHz mono. */
export interface WavOptions {
  readonly sampleRate: number
  readonly channels: 1 | 2
}

function planar(block: PcmBlock) {
  const frames = block.range.endFrame - block.range.startFrame
  const data = new Float32Array(frames * block.channels.length)
  block.channels.forEach((channel, index) => data.set(channel, index * frames))
  return data
}

/**
 * Encodes PCM blocks into a 16-bit WAV file while the stream arrives.
 *
 * Mediabunny resamples and remixes to `options`. Aborting `signal` cancels the stream and the output.
 *
 * @example
 * const wav = await encodeWav(capture.stream, { sampleRate: 16000, channels: 1 })
 * // => Blob { type: 'audio/wav' }
 */
export async function encodeWav(frames: ReadableStream<PcmBlock>, options: WavOptions, signal?: AbortSignal): Promise<Blob> {
  const output = new Output({ format: new WavOutputFormat(), target: new BufferTarget() })
  const source = new AudioSampleSource({ codec: 'pcm-s16', transform: { sampleRate: options.sampleRate, numberOfChannels: options.channels } })
  output.addAudioTrack(source)
  const reader = frames.getReader()
  const abort = () => void reader.cancel(signal?.reason).catch(() => {})
  signal?.addEventListener('abort', abort, { once: true })
  try {
    signal?.throwIfAborted()
    await output.start()
    let startFrame: number | undefined
    while (true) {
      const { done, value: block } = await reader.read()
      signal?.throwIfAborted()
      if (done)
        break

      startFrame ??= block.range.startFrame
      await source.add(new AudioSample({
        data: planar(block),
        format: 'f32-planar',
        numberOfChannels: block.channels.length,
        sampleRate: block.sampleRate,
        timestamp: (block.range.startFrame - startFrame) / block.sampleRate,
      }))
    }
    source.close()
    await output.finalize()
    return new Blob([output.target.buffer!], { type: 'audio/wav' })
  }
  catch (error) {
    await output.cancel().catch(() => {})
    throw error
  }
  finally {
    signal?.removeEventListener('abort', abort)
    reader.releaseLock()
  }
}

/**
 * Decodes an audio file as a source. Each connection decodes from the start with new frame coordinates.
 *
 * @example
 * const events = transcriber.transcribe({ audio: fileSource(recording).open(signal), signal })
 */
export function fileSource(file: Blob): AudioInputSource {
  return {
    open(signal) {
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
      const sourceId = crypto.randomUUID()
      let samples: AsyncGenerator<AudioSample> | undefined
      let frame = 0
      return new ReadableStream<PcmBlock>({
        async pull(output) {
          if (!samples) {
            const track = await input.getPrimaryAudioTrack()
            if (!track)
              throw new Error('The file has no audio track')
            samples = new AudioSampleSink(track).samples()
          }
          signal.throwIfAborted()
          const { done, value: sample } = await samples.next()
          if (done) {
            output.close()
            input.dispose()
            return
          }

          try {
            const channels = Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
              const channel = new Float32Array(sample.numberOfFrames)
              sample.copyTo(channel, { format: 'f32-planar', planeIndex })
              return channel
            })
            output.enqueue({ range: { sourceId, startFrame: frame, endFrame: frame + sample.numberOfFrames }, sampleRate: sample.sampleRate, channels })
            frame += sample.numberOfFrames
          }
          finally {
            sample.close()
          }
        },
        async cancel() {
          await samples?.return(undefined)
          input.dispose()
        },
      })
    },
  }
}
