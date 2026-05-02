export interface NativeDuplexAudioPlayerController {
  playChunk: (base64Data: string) => Promise<void>
  stop: () => Promise<void>
}

interface CreateNativeDuplexAudioPlayerOptions {
  initialDelayMs?: number
  sampleRate?: number
}

const DEFAULT_INITIAL_DELAY_MS = 180
const DEFAULT_SAMPLE_RATE = 24_000

function decodeBase64ToFloat32(base64Data: string): Float32Array {
  const binary = atob(base64Data)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index)

  return new Float32Array(bytes.buffer)
}

export async function createNativeDuplexAudioPlayer(
  options: CreateNativeDuplexAudioPlayerOptions = {},
): Promise<NativeDuplexAudioPlayerController> {
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE
  const audioContext = new AudioContext({ latencyHint: 'interactive' })
  const activeSources = new Set<AudioBufferSourceNode>()

  let nextPlaybackTime = 0

  async function ensureRunning() {
    if (audioContext.state === 'suspended')
      await audioContext.resume()
  }

  async function playChunk(base64Data: string) {
    if (!base64Data)
      return

    await ensureRunning()

    const samples = decodeBase64ToFloat32(base64Data)
    if (samples.length === 0)
      return

    const buffer = audioContext.createBuffer(1, samples.length, sampleRate)
    buffer.getChannelData(0).set(samples)

    const source = audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(audioContext.destination)

    const now = audioContext.currentTime
    if (nextPlaybackTime <= now)
      nextPlaybackTime = now + (initialDelayMs / 1000)

    source.start(nextPlaybackTime)
    nextPlaybackTime += buffer.duration
    activeSources.add(source)

    source.onended = () => {
      activeSources.delete(source)
    }
  }

  async function stop() {
    for (const source of activeSources) {
      try {
        source.stop()
      }
      catch {
      }

      try {
        source.disconnect()
      }
      catch {
      }
    }

    activeSources.clear()
    nextPlaybackTime = 0

    if (audioContext.state !== 'closed')
      await audioContext.close()
  }

  return {
    playChunk,
    stop,
  }
}
