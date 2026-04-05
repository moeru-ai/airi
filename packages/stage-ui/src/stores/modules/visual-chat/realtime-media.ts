export interface RealtimeVideoFramePayload {
  timestamp: number
  width: number
  height: number
  format: 'jpeg' | 'png'
  data: string
}

export interface RealtimeAudioChunkPayload {
  timestamp: number
  sampleRate: 16000
  channels: 1
  durationMs: 1000
  data: string
}

export interface RealtimeVideoStreamerController {
  stop: () => void
}

export interface RealtimeAudioStreamerController {
  stop: () => Promise<void>
}

interface CreateRealtimeVideoStreamerOptions {
  stream: MediaStream
  intervalMs?: number
  maxPixels?: number
  quality?: number
  format?: 'jpeg' | 'png'
  onFrame: (payload: RealtimeVideoFramePayload) => void
}

interface CreateRealtimeAudioStreamerOptions {
  stream: MediaStream
  onChunk: (payload: RealtimeAudioChunkPayload) => void
}

const DEFAULT_VIDEO_INTERVAL_MS = 1000
const DEFAULT_MAX_VIDEO_PIXELS = 1_280 * 720
const DEFAULT_VIDEO_QUALITY = 0.78
const TARGET_AUDIO_SAMPLE_RATE = 16000
const TARGET_AUDIO_DURATION_MS = 1000
const TARGET_AUDIO_SAMPLES = TARGET_AUDIO_SAMPLE_RATE * (TARGET_AUDIO_DURATION_MS / 1000)

function mixToMono(inputBuffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(inputBuffer.length)
  const channelCount = inputBuffer.numberOfChannels

  for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
    const channelData = inputBuffer.getChannelData(channelIndex)
    for (let sampleIndex = 0; sampleIndex < channelData.length; sampleIndex++)
      mono[sampleIndex] += channelData[sampleIndex] / channelCount
  }

  return mono
}

function concatFloat32Arrays(left: Float32Array, right: Float32Array): Float32Array {
  return Float32Array.from([...left, ...right])
}

function downsampleTo16k(input: Float32Array, inputSampleRate: number): Int16Array {
  if (inputSampleRate === TARGET_AUDIO_SAMPLE_RATE) {
    const pcm = new Int16Array(input.length)
    for (let index = 0; index < input.length; index++) {
      const clamped = Math.max(-1, Math.min(1, input[index] ?? 0))
      pcm[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF
    }
    return pcm
  }

  const ratio = inputSampleRate / TARGET_AUDIO_SAMPLE_RATE
  const outputLength = Math.max(1, Math.round(input.length / ratio))
  const pcm = new Int16Array(outputLength)

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex++) {
    const start = Math.floor(outputIndex * ratio)
    const end = Math.min(input.length, Math.floor((outputIndex + 1) * ratio))
    let sample = 0
    let count = 0

    for (let index = start; index < end; index++) {
      sample += input[index] ?? 0
      count++
    }

    const averaged = count > 0 ? sample / count : 0
    const clamped = Math.max(-1, Math.min(1, averaged))
    pcm[outputIndex] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF
  }

  return pcm
}

function int16ToBase64(data: Int16Array): string {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function createRealtimeSourceId(participantIdentity: string, sourceName: string): string {
  return `${participantIdentity}:${sourceName}`
}

export function stopMediaStreamTracks(stream: MediaStream | null | undefined) {
  if (!stream)
    return

  for (const track of stream.getTracks())
    track.stop()
}

export async function createRealtimeVideoStreamer(
  options: CreateRealtimeVideoStreamerOptions,
): Promise<RealtimeVideoStreamerController> {
  const intervalMs = options.intervalMs ?? DEFAULT_VIDEO_INTERVAL_MS
  const maxPixels = options.maxPixels ?? DEFAULT_MAX_VIDEO_PIXELS
  const quality = options.quality ?? DEFAULT_VIDEO_QUALITY
  const format = options.format ?? 'jpeg'

  const video = document.createElement('video')
  video.srcObject = options.stream
  video.muted = true
  video.playsInline = true
  await video.play()

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('Canvas 2D context is unavailable for realtime video capture.')

  const timer = window.setInterval(() => {
    if (!video.videoWidth || !video.videoHeight)
      return

    const scale = Math.min(1, Math.sqrt(maxPixels / (video.videoWidth * video.videoHeight)))
    const width = Math.max(1, Math.round(video.videoWidth * scale))
    const height = Math.max(1, Math.round(video.videoHeight * scale))

    canvas.width = width
    canvas.height = height
    context.drawImage(video, 0, 0, width, height)

    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
    const data = canvas.toDataURL(mimeType, quality).split(',')[1]
    if (!data)
      return

    options.onFrame({
      timestamp: Date.now(),
      width,
      height,
      format,
      data,
    })
  }, intervalMs)

  return {
    stop() {
      window.clearInterval(timer)
      video.pause()
      video.srcObject = null
    },
  }
}

export async function createRealtimeAudioStreamer(
  options: CreateRealtimeAudioStreamerOptions,
): Promise<RealtimeAudioStreamerController> {
  // NOTICE: ScriptProcessorNode is deprecated but still the most portable
  // browser-side way for this repo to chunk raw PCM without adding another
  // worklet bundle path just for realtime visual chat.
  const audioContext = new AudioContext({ latencyHint: 'interactive' })
  const sourceNode = audioContext.createMediaStreamSource(options.stream)
  const processorNode = audioContext.createScriptProcessor(4096, 1, 1)
  const muteNode = audioContext.createGain()
  muteNode.gain.value = 0

  let pending: Float32Array<ArrayBufferLike> = new Float32Array(0)
  const chunkSampleSize = audioContext.sampleRate * (TARGET_AUDIO_DURATION_MS / 1000)

  processorNode.onaudioprocess = (event) => {
    const mono = mixToMono(event.inputBuffer)
    pending = concatFloat32Arrays(pending, mono)

    while (pending.length >= chunkSampleSize) {
      const nextChunk = Float32Array.from(pending.subarray(0, chunkSampleSize))
      pending = Float32Array.from(pending.subarray(chunkSampleSize))

      const downsampled = downsampleTo16k(nextChunk, audioContext.sampleRate)
      const normalizedChunk = downsampled.length === TARGET_AUDIO_SAMPLES
        ? downsampled
        : downsampled.length > TARGET_AUDIO_SAMPLES
          ? downsampled.slice(0, TARGET_AUDIO_SAMPLES)
          : (() => {
              const padded = new Int16Array(TARGET_AUDIO_SAMPLES)
              padded.set(downsampled)
              return padded
            })()

      options.onChunk({
        timestamp: Date.now(),
        sampleRate: 16000,
        channels: 1,
        durationMs: 1000,
        data: int16ToBase64(normalizedChunk),
      })
    }
  }

  sourceNode.connect(processorNode)
  processorNode.connect(muteNode)
  muteNode.connect(audioContext.destination)
  await audioContext.resume()

  return {
    async stop() {
      processorNode.disconnect()
      sourceNode.disconnect()
      muteNode.disconnect()
      processorNode.onaudioprocess = null
      await audioContext.close()
    },
  }
}
