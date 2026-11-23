import type { PcmBlock } from '@proj-airi/pipelines-audio'

/** Format of a PCM WAV stream, read from its `fmt ` chunk. */
export interface WavFormat {
  readonly channels: number
  readonly sampleRate: number
}

export interface DecodeWavStreamOptions {
  /** Source ID of the emitted blocks. */
  readonly sourceId: string
  /**
   * Smallest block in frames, except the last one. Larger blocks mean fewer Web Audio nodes.
   *
   * @default 2048
   */
  readonly minBlockFrames?: number
}

const RIFF = 0x46_46_49_52 // 'RIFF', little endian
const WAVE = 0x45_56_41_57 // 'WAVE', little endian
const FMT = 0x20_74_6D_66 // 'fmt ', little endian
const DATA = 0x61_74_61_64 // 'data', little endian
/** WAV `fmt ` audio format code of integer PCM. */
const WAVE_FORMAT_PCM = 1
const WAVE_FORMAT_EXTENSIBLE = 0xFF_FE

/**
 * Reads the header of a WAV byte stream.
 *
 * Use when:
 * - A server streams WAV audio and the client must play it before the last byte arrives.
 *
 * Expects:
 * - `bytes` starts at the first byte of the stream.
 *
 * Returns:
 * - `undefined` while the header is incomplete.
 * - The format and the offset of the first sample after the `data` chunk header.
 * - `null` when the bytes are not a 16-bit PCM WAV stream, for example MP3.
 *
 * The chunk sizes of a streamed WAV are often placeholders, so the decoder does not read them.
 */
export function readWavHeader(bytes: Uint8Array): { format: WavFormat, dataOffset: number } | null | undefined {
  if (bytes.length < 12)
    return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== RIFF || view.getUint32(8, true) !== WAVE)
    return null

  let format: WavFormat | undefined
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const id = view.getUint32(offset, true)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === DATA)
      return format ? { format, dataOffset: body } : null
    if (body + size > bytes.length)
      return undefined
    if (id === FMT) {
      if (size < 16)
        return null
      const audioFormat = view.getUint16(body, true)
      const channels = view.getUint16(body + 2, true)
      const sampleRate = view.getUint32(body + 4, true)
      const bitsPerSample = view.getUint16(body + 14, true)
      if ((audioFormat !== WAVE_FORMAT_PCM && audioFormat !== WAVE_FORMAT_EXTENSIBLE) || bitsPerSample !== 16 || channels < 1 || sampleRate < 1)
        return null
      format = { channels, sampleRate }
    }
    // Chunks are word aligned: an odd size has one pad byte.
    offset = body + size + (size % 2)
  }
  return undefined
}

/**
 * Turns a streamed 16-bit PCM WAV body into planar PCM blocks as the bytes arrive.
 *
 * Use when:
 * - Speech audio must start playing before the provider finishes synthesis.
 *
 * Expects:
 * - `body` is a WAV stream that {@link readWavHeader} accepts. Check the first bytes with
 *   {@link readWavHeader} first, or the stream errors.
 *
 * Returns:
 * - A stream of blocks with continuous frame ranges. Cancelling it cancels `body`.
 */
export function decodeWavStream(body: ReadableStream<Uint8Array>, options: DecodeWavStreamOptions): ReadableStream<PcmBlock> {
  const minBlockFrames = Math.max(1, options.minBlockFrames ?? 2048)
  const reader = body.getReader()
  let header: Uint8Array = new Uint8Array(0)
  let format: WavFormat | undefined
  /** Sample bytes that do not fill a whole frame yet. */
  let carry: Uint8Array = new Uint8Array(0)
  let pending: Float32Array[][] = []
  let pendingFrames = 0
  let frame = 0

  const emit = (controller: ReadableStreamDefaultController<PcmBlock>) => {
    if (!format || pendingFrames === 0)
      return
    const channels = Array.from({ length: format.channels }, (_, channel) => {
      const merged = new Float32Array(pendingFrames)
      let at = 0
      for (const part of pending) {
        merged.set(part[channel]!, at)
        at += part[channel]!.length
      }
      return merged
    })
    controller.enqueue({ range: { sourceId: options.sourceId, startFrame: frame, endFrame: frame + pendingFrames }, sampleRate: format.sampleRate, channels })
    frame += pendingFrames
    pending = []
    pendingFrames = 0
  }

  const push = (bytes: Uint8Array) => {
    if (!format)
      return
    const frameBytes = format.channels * 2
    const joined = concat(carry, bytes)
    const frames = Math.floor(joined.length / frameBytes)
    carry = joined.slice(frames * frameBytes)
    if (frames === 0)
      return
    const view = new DataView(joined.buffer, joined.byteOffset, frames * frameBytes)
    const channels = Array.from({ length: format.channels }, () => new Float32Array(frames))
    for (let index = 0; index < frames; index++) {
      for (let channel = 0; channel < format.channels; channel++)
        channels[channel]![index] = view.getInt16((index * format.channels + channel) * 2, true) / 32768
    }
    pending.push(channels)
    pendingFrames += frames
  }

  return new ReadableStream<PcmBlock>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          if (!format)
            throw new Error('WAV stream ended before its data chunk')
          emit(controller)
          controller.close()
          return
        }
        if (!format) {
          header = concat(header, value)
          const parsed = readWavHeader(header)
          if (parsed === null)
            throw new Error('Speech audio is not a 16-bit PCM WAV stream')
          if (!parsed)
            continue
          format = parsed.format
          push(header.subarray(parsed.dataOffset))
          header = new Uint8Array(0)
        }
        else {
          push(value)
        }
        if (pendingFrames >= minBlockFrames) {
          emit(controller)
          return
        }
      }
    },
    async cancel(reason) {
      await reader.cancel(reason)
    },
  })
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.length === 0)
    return right
  const joined = new Uint8Array(left.length + right.length)
  joined.set(left)
  joined.set(right, left.length)
  return joined
}
