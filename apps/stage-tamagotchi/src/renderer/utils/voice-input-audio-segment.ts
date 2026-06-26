export interface VoiceInputPcmSegment {
  buffer: Float32Array
  durationMs?: number
  sampleRate?: number
}

export interface VoiceInputAudioDiagnostics {
  durationMs: number
  peak: number
  rms: number
  sampleCount: number
  sampleRate: number
}

export type VoiceInputSegmentSkipReason = 'empty' | 'too_short' | 'too_quiet'

export interface VoiceInputSegmentQualityGateOptions {
  minDurationMs?: number
  minPeak?: number
  minRms?: number
}

const DEFAULT_SAMPLE_RATE = 16000
const PCM_BYTES_PER_SAMPLE = 2
const WAV_HEADER_BYTES = 44
const WAV_FORMAT_PCM = 1
const WAV_CHANNEL_COUNT = 1
const WAV_BITS_PER_SAMPLE = 16
const DEFAULT_MIN_SEGMENT_DURATION_MS = 450
const DEFAULT_MIN_SEGMENT_PEAK = 0.018
const DEFAULT_MIN_SEGMENT_RMS = 0.004

/**
 * Clamps a floating-point PCM sample into signed 16-bit WAV range.
 */
function floatSampleToInt16(sample: number) {
  const clamped = Math.max(-1, Math.min(1, sample))
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF
}

/**
 * Writes a fixed PCM WAV header for mono 16-bit speech segments.
 */
function writeWavHeader(view: DataView, dataBytes: number, sampleRate: number) {
  const textEncoder = new TextEncoder()
  const writeAscii = (offset: number, text: string) => {
    const bytes = textEncoder.encode(text)
    for (let i = 0; i < bytes.length; i += 1)
      view.setUint8(offset + i, bytes[i])
  }

  const byteRate = sampleRate * WAV_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE
  const blockAlign = WAV_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, WAV_FORMAT_PCM, true)
  view.setUint16(22, WAV_CHANNEL_COUNT, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, WAV_BITS_PER_SAMPLE, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataBytes, true)
}

/**
 * Measures speech-segment loudness before sending it to a transcription provider.
 */
function measureVoiceInputSegment(buffer: Float32Array, sampleRate: number, durationMs?: number): VoiceInputAudioDiagnostics {
  let peak = 0
  let squareSum = 0

  for (const sample of buffer) {
    const abs = Math.abs(sample)
    peak = Math.max(peak, abs)
    squareSum += sample * sample
  }

  const sampleCount = buffer.length
  const rms = sampleCount > 0 ? Math.sqrt(squareSum / sampleCount) : 0

  return {
    durationMs: durationMs ?? (sampleCount / sampleRate) * 1000,
    peak,
    rms,
    sampleCount,
    sampleRate,
  }
}

/**
 * Wraps VAD Float32 PCM output as a mono 16-bit WAV blob for transcription.
 *
 * Use when:
 * - Silero VAD has already segmented microphone input.
 * - The provider expects multipart audio files instead of a live stream.
 *
 * Expects:
 * - PCM samples are normalized to the browser audio range `[-1, 1]`.
 *
 * Returns:
 * - A WAV blob and diagnostics for provider/debug logging.
 */
export function createVoiceInputWavFromPcmSegment(segment: VoiceInputPcmSegment) {
  const sampleRate = segment.sampleRate ?? DEFAULT_SAMPLE_RATE
  const dataBytes = segment.buffer.length * PCM_BYTES_PER_SAMPLE
  const wavBuffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(wavBuffer)

  writeWavHeader(view, dataBytes, sampleRate)

  for (let i = 0; i < segment.buffer.length; i += 1) {
    view.setInt16(WAV_HEADER_BYTES + i * PCM_BYTES_PER_SAMPLE, floatSampleToInt16(segment.buffer[i]), true)
  }

  return {
    blob: new Blob([wavBuffer], { type: 'audio/wav' }),
    diagnostics: measureVoiceInputSegment(segment.buffer, sampleRate, segment.durationMs),
  }
}

/**
 * Decides whether a VAD segment is useful enough to send to ASR.
 */
export function shouldSkipVoiceInputSegment(
  diagnostics: VoiceInputAudioDiagnostics,
  options: VoiceInputSegmentQualityGateOptions = {},
): { skip: false } | { skip: true, reason: VoiceInputSegmentSkipReason } {
  if (diagnostics.sampleCount <= 0)
    return { skip: true, reason: 'empty' }

  if (diagnostics.durationMs < (options.minDurationMs ?? DEFAULT_MIN_SEGMENT_DURATION_MS))
    return { skip: true, reason: 'too_short' }

  const minPeak = options.minPeak ?? DEFAULT_MIN_SEGMENT_PEAK
  const minRms = options.minRms ?? DEFAULT_MIN_SEGMENT_RMS
  if (diagnostics.peak < minPeak && diagnostics.rms < minRms)
    return { skip: true, reason: 'too_quiet' }

  return { skip: false }
}
