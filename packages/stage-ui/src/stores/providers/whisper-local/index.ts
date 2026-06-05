import type { TranscriptionProvider } from '@xsai-ext/providers/utils'

import { getWhisperAdapter } from '../../../libs/inference/adapters/whisper'
import { DEFAULT_WHISPER_MODEL } from '../../../libs/inference/constants'

/** Sample rate Whisper's processor expects (16 kHz mono PCM). */
const WHISPER_SAMPLE_RATE = 16000

/**
 * Decode an audio Blob (any browser-supported container: wav/webm/ogg/mp4…) to
 * the 16 kHz mono `Float32Array` the Whisper worker consumes.
 *
 * NOTICE:
 * Constructing the `AudioContext` at 16 kHz makes `decodeAudioData` resample to
 * that rate for us; otherwise we'd have to resample by hand. Multi-channel audio
 * is downmixed to mono (Whisper is mono-only) by averaging channels.
 */
async function decodeToWhisperAudio(blob: Blob): Promise<Float32Array> {
  const audioContext = new AudioContext({ sampleRate: WHISPER_SAMPLE_RATE })
  try {
    const arrayBuffer = await blob.arrayBuffer()
    const decoded = await audioContext.decodeAudioData(arrayBuffer)
    if (decoded.numberOfChannels === 1)
      return decoded.getChannelData(0)

    const left = decoded.getChannelData(0)
    const right = decoded.getChannelData(1)
    const mono = new Float32Array(left.length)
    for (let i = 0; i < left.length; i++)
      mono[i] = (left[i] + right[i]) / 2
    return mono
  }
  finally {
    // Release the audio hardware/graph; decoding doesn't need a running context.
    await audioContext.close()
  }
}

/** Configuration captured when the provider instance is created. */
export interface WhisperLocalProviderConfig {
  /**
   * Whisper transcription language as an ISO 639-1 code (e.g. `"en"`).
   * @default 'en'
   */
  language?: string
}

/**
 * Local Whisper transcription provider.
 *
 * Use when:
 * - Wiring in-browser Whisper ASR as a `transcription` provider so the hearing
 *   store can drive it through `generateTranscription` with no special-casing.
 *
 * Expects:
 * - A WebGPU- or WASM-capable browser/Electron renderer; the worker falls back
 *   WebGPU → WASM on its own.
 *
 * Returns:
 * - An OpenAI-compatible {@link TranscriptionProvider}. The returned `fetch`
 *   intercepts the multipart request, decodes the uploaded audio to 16 kHz mono
 *   (see {@link decodeToWhisperAudio}), and runs it through the in-browser
 *   Whisper worker (see {@link getWhisperAdapter}) instead of hitting the
 *   network — mirroring the cloud transcription providers' shape.
 */
export function createWhisperLocalTranscriptionProvider(config: WhisperLocalProviderConfig = {}): TranscriptionProvider {
  const defaultLanguage = config.language || 'en'

  return {
    transcription: model => ({
      baseURL: 'http://whisper-local/v1/',
      model,
      headers: {},
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        const formData = init?.body as FormData
        const file = formData?.get('file') as Blob | null
        if (!file)
          throw new Error('No audio file provided for transcription.')

        const language = (formData?.get('language') as string) || defaultLanguage
        // The selected model id is the Hugging Face repo (see WHISPER_MODELS).
        const repo = model || DEFAULT_WHISPER_MODEL

        const audioFloat32 = await decodeToWhisperAudio(file)

        const adapter = await getWhisperAdapter()
        // Load-on-demand, and reload when the requested model differs from what is
        // currently loaded — the adapter is a singleton shared across calls. load()
        // is serialized by the worker host, so concurrent callers don't double-load.
        // Forward the request's abort signal so cancelling/abandoning the fetch
        // actually stops the worker's load (~800 MB download) and inference, rather
        // than letting them run to their own timeout.
        if (adapter.state !== 'ready' || adapter.manifest?.model !== repo)
          await adapter.load(undefined, { signal: init?.signal ?? undefined, model: repo })

        const text = await adapter.transcribe({ audioFloat32, language }, { signal: init?.signal ?? undefined })

        // OpenAI transcription response shape: { text }.
        return new Response(JSON.stringify({ text }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    }),
  }
}
