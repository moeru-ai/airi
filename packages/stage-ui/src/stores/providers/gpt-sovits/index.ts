import type { SpeechProvider } from '@xsai-ext/providers/utils'

import type { ModelInfo, ProviderMetadata, VoiceInfo } from '../../providers'

const PROVIDER_ID = 'gpt-sovits'
const DEFAULT_BASE_URL = 'http://127.0.0.1:9880/'

/**
 * Runtime configuration captured at provider-creation time.
 * All fields are forwarded to the GPT-SoVITS v2 `/tts` endpoint.
 */
interface GptSoVitsRuntimeConfig {
  baseUrl: string
  /**
   * Absolute path to the reference audio file used as voice prompt.
   * e.g. `D:\Resources\TTS\Amiya\ref.wav`
   */
  refAudioPath: string
  /** Transcript of the reference audio, used as prompt text for the model. */
  promptText: string
  /**
   * Language code for the reference audio.
   * Accepted: `zh`, `en`, `ja`, `zh_ja`, `zh_en`, `ja_en`, `auto`, `auto_yue`
   * @default 'auto'
   */
  promptLang: string
  /**
   * Language code for the text to synthesize.
   * Same set of values as promptLang.
   * @default 'auto'
   */
  textLang: string
}

function normalizeBaseUrl(raw: unknown): string {
  const url = typeof raw === 'string' ? raw.trim() : DEFAULT_BASE_URL
  return url.endsWith('/') ? url : `${url}/`
}

function toString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

/**
 * Creates a custom fetch adapter that translates an OpenAI-compatible TTS
 * request into a GPT-SoVITS v2 `/tts` POST, returning the WAV audio response.
 *
 * NOTICE:
 * The adapter ignores the model and voice fields from the OpenAI body
 * because GPT-SoVITS uses a reference-audio approach instead of named voices.
 * The actual voice identity comes from `config.refAudioPath` + `config.promptText`.
 */
function createGptSoVitsFetch(config: GptSoVitsRuntimeConfig) {
  return async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!init?.body || typeof init.body !== 'string')
      throw new Error('GPT-SoVITS: invalid request body from generateSpeech')

    const body = JSON.parse(init.body)
    const text: string = body.input ?? ''

    const response = await globalThis.fetch(new URL('tts', config.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        text_lang: config.textLang || 'auto',
        ref_audio_path: config.refAudioPath,
        prompt_text: config.promptText,
        prompt_lang: config.promptLang || 'auto',
        media_type: 'wav',
        streaming_mode: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`GPT-SoVITS TTS request failed: ${response.status} ${errorText}`)
    }

    return response
  }
}

function createSpeechProvider(config: GptSoVitsRuntimeConfig): SpeechProvider {
  return {
    speech: (_model?: string) => ({
      // NOTICE:
      // A dummy baseURL is required because xsai's generateSpeech constructs a
      // URL from baseURL + "audio/speech". We override the HTTP call entirely
      // with the custom fetch adapter, so the dummy baseURL is never contacted.
      baseURL: 'http://gpt-sovits.local/v1/',
      model: 'gpt-sovits',
      fetch: createGptSoVitsFetch(config),
    }),
  }
}

/**
 * Builds the ProviderMetadata entry for GPT-SoVITS.
 *
 * Use when:
 * - User has a GPT-SoVITS v2/v3/v4 server running locally (default: port 9880)
 * - User wants to use a custom reference audio as the character voice
 *
 * Expects:
 * - `baseUrlValidator` from the providers store (standard URL shape validator)
 *
 * Returns:
 * - A `ProviderMetadata` object ready to be inserted into `providerMetadata`
 */
export function buildGptSoVitsProvider(
  baseUrlValidator: (baseUrl: unknown) => { errors: unknown[], reason: string, valid: boolean } | null | undefined,
): ProviderMetadata {
  return {
    id: PROVIDER_ID,
    category: 'speech',
    tasks: ['text-to-speech', 'tts'],
    nameKey: 'settings.pages.providers.provider.gpt-sovits.title',
    name: 'GPT-SoVITS',
    descriptionKey: 'settings.pages.providers.provider.gpt-sovits.description',
    description: 'github.com/RVC-Boss/GPT-SoVITS',
    icon: 'i-solar:soundwave-bold-duotone',
    deployment: 'local',
    pricing: 'free',
    defaultOptions: () => ({
      baseUrl: DEFAULT_BASE_URL,
      refAudioPath: '',
      promptText: '',
      promptLang: 'auto',
      textLang: 'auto',
    }),
    onboardingFields: [
      {
        key: 'baseUrl',
        type: 'text',
        label: 'Base URL',
        description: 'GPT-SoVITS v2 server address. Default port is 9880.',
        placeholder: DEFAULT_BASE_URL,
        required: true,
        defaultValue: DEFAULT_BASE_URL,
      },
      {
        key: 'refAudioPath',
        type: 'text',
        label: 'Reference Audio Path',
        description: 'Absolute path to the reference WAV file used as voice prompt.',
        placeholder: 'C:\\path\\to\\reference.wav',
        required: true,
      },
      {
        key: 'promptText',
        type: 'text',
        label: 'Reference Audio Transcript',
        description: 'The text spoken in the reference audio.',
        placeholder: 'これは私の身勝手な考えかもしれません。',
        required: true,
      },
      {
        key: 'promptLang',
        type: 'text',
        label: 'Reference Audio Language',
        description: 'Language of the reference audio. One of: zh, en, ja, auto, auto_yue, zh_ja, zh_en, ja_en.',
        placeholder: 'auto',
        defaultValue: 'auto',
      },
      {
        key: 'textLang',
        type: 'text',
        label: 'Output Text Language',
        description: 'Language of the text to synthesize. Same options as reference audio language.',
        placeholder: 'auto',
        defaultValue: 'auto',
      },
    ],
    createProvider: async (config) => {
      const runtimeConfig: GptSoVitsRuntimeConfig = {
        baseUrl: normalizeBaseUrl(config.baseUrl),
        refAudioPath: toString(config.refAudioPath),
        promptText: toString(config.promptText),
        promptLang: toString(config.promptLang, 'auto'),
        textLang: toString(config.textLang, 'auto'),
      }
      return createSpeechProvider(runtimeConfig)
    },
    capabilities: {
      listModels: async (): Promise<ModelInfo[]> => [
        {
          id: 'gpt-sovits',
          name: 'GPT-SoVITS',
          provider: PROVIDER_ID,
          description: 'GPT-SoVITS voice cloning model. Uses reference audio as the voice.',
          contextLength: 0,
          deprecated: false,
        },
      ],
      listVoices: async (config): Promise<VoiceInfo[]> => {
        const refPath = toString(config.refAudioPath)
        return [
          {
            id: 'default',
            name: refPath ? `Reference: ${refPath.split(/[\\/]/).pop() ?? refPath}` : 'Default (configure reference audio)',
            provider: PROVIDER_ID,
            languages: [],
          },
        ]
      },
    },
    validators: {
      chatPingCheckAvailable: false,
      validateProviderConfig: (config) => {
        const errors: Error[] = []

        // Normalize before validating so a missing trailing slash isn't a
        // false-negative (the createProvider step also normalizes).
        const normalizedUrl = typeof config.baseUrl === 'string' ? normalizeBaseUrl(config.baseUrl) : ''

        if (!normalizedUrl) {
          errors.push(new Error('Base URL is required.'))
        }
        else {
          const res = baseUrlValidator(normalizedUrl)
          if (res)
            return res
        }

        if (!config.refAudioPath)
          errors.push(new Error('Reference audio path is required.'))

        if (!config.promptText)
          errors.push(new Error('Reference audio transcript (prompt text) is required.'))

        return {
          errors,
          reason: errors.map(e => e.message).join(', '),
          valid: errors.length === 0,
        }
      },
    },
  }
}
