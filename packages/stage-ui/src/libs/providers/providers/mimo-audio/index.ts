import { z } from 'zod'

import { defineProvider } from '../registry'

const mimoSpeechConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default('https://api.xiaomimimo.com/v1/'),
  format: z.string().default('wav'),
  model: z.string().default('mimo-v2.5-tts'),
  stylePrompt: z.string().optional(),
  voice: z.string().default('mimo_default'),
  voiceSample: z.string().optional(),
})

const mimoTranscriptionConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default('https://api.xiaomimimo.com/v1/'),
  model: z.string().default('mimo-v2-omni'),
})

type MimoConfig = MimoSpeechConfig | MimoTranscriptionConfig
type MimoSpeechConfig = z.input<typeof mimoSpeechConfigSchema>
type MimoTranscriptionConfig = z.input<typeof mimoTranscriptionConfigSchema>

function audioFormatFromDataUri(dataUri: string) {
  const mimeType = dataUri.split(';')[0]?.split(':')[1] || 'audio/wav'
  const format = mimeType.split('/')[1] || 'wav'
  if (format === 'webm' || format === 'mp4')
    return format
  if (format === 'mpeg' || format === 'mp3')
    return 'mp3'
  return 'wav'
}

function createMimoSpeechProvider(config: MimoSpeechConfig) {
  const apiKey = config.apiKey?.trim() ?? ''
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const defaultModel = config.model || 'mimo-v2.5-tts'
  const defaultVoice = config.voice || 'mimo_default'
  const defaultFormat = config.format || 'wav'

  return {
    speech: () => ({
      baseURL: baseUrl,
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.body || typeof init.body !== 'string')
          throw new Error('Invalid request body')

        const body = JSON.parse(init.body) as {
          input?: string
          model?: string
          response_format?: string
          style_prompt?: string
          voice?: string
          voice_sample?: string
        }
        const model = body.model || defaultModel
        const format = body.response_format || defaultFormat
        const stylePrompt = body.style_prompt?.trim() || config.stylePrompt?.trim() || ''
        const voiceSample = body.voice_sample?.trim() || config.voiceSample?.trim() || ''
        const userPrompt = model === 'mimo-v2.5-tts-voiceclone'
          ? stylePrompt
          : stylePrompt || 'Use a natural, clear speaking style.'

        const audio: Record<string, string> = { format }
        if (model === 'mimo-v2.5-tts-voiceclone') {
          if (!voiceSample)
            throw new Error('MiMo voice clone requires a base64 audio sample in data URI format.')
          audio.voice = voiceSample
        }
        else if (model === 'mimo-v2.5-tts') {
          audio.voice = body.voice || defaultVoice
        }

        if (model === 'mimo-v2.5-tts-voicedesign' && !stylePrompt)
          throw new Error('MiMo voice design requires a style prompt in the user message.')

        const response = await fetch(new URL('chat/completions', baseUrl), {
          body: JSON.stringify({
            audio,
            messages: [
              { content: userPrompt, role: 'user' },
              { content: body.input ?? '', role: 'assistant' },
            ],
            model,
          }),
          headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
          method: 'POST',
        })
        if (!response.ok || !response.body)
          throw new Error(`MiMo TTS request failed: ${response.status} ${response.statusText}`)

        const data = await response.json() as {
          choices?: Array<{ message?: { audio?: { data?: string } } }>
        }
        const audioBase64 = data.choices?.[0]?.message?.audio?.data
        if (!audioBase64)
          throw new Error('MiMo TTS response missing audio data')

        const binary = atob(audioBase64)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index++)
          bytes[index] = binary.charCodeAt(index)

        let contentType = `audio/${format}`
        if (format === 'wav')
          contentType = 'audio/wav'
        else if (format === 'mp3')
          contentType = 'audio/mpeg'

        return new Response(bytes.buffer, {
          headers: { 'Content-Type': contentType },
          status: 200,
        })
      },
      model: defaultModel,
    }),
  }
}

function createMimoTranscriptionProvider(config: MimoTranscriptionConfig) {
  const apiKey = config.apiKey?.trim() ?? ''
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const defaultModel = config.model || 'mimo-v2-omni'

  return {
    transcription: (model: string) => ({
      baseURL: baseUrl,
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!(init?.body instanceof FormData))
          throw new Error('No audio file provided for transcription.')

        const file = init.body.get('file')
        if (!(file instanceof Blob))
          throw new Error('No audio file provided for transcription.')

        const modelName = String(init.body.get('model') || defaultModel)
        const dataUri = await readBlobAsDataUri(file)
        const base64Data = dataUri.split(',')[1]
        const response = await fetch(new URL('chat/completions', baseUrl), {
          body: JSON.stringify({
            messages: [{
              content: [
                { text: 'Transcribe the audio content.', type: 'text' },
                { input_audio: { data: base64Data, format: audioFormatFromDataUri(dataUri) }, type: 'input_audio' },
              ],
              role: 'user',
            }],
            model: modelName,
          }),
          headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
          method: 'POST',
        })
        if (!response.ok) {
          const errorBody = await response.text().catch(() => '')
          throw new Error(`MiMo transcription failed: ${response.status} ${response.statusText}${errorBody ? ` — ${errorBody}` : ''}`)
        }

        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
        return new Response(JSON.stringify({ text: data.choices?.[0]?.message?.content || '' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        })
      },
      headers: {},
      model: model || defaultModel,
    }),
  }
}

function createMimoValidators<TConfig extends MimoConfig>(id: string) {
  return {
    validateConfig: [
      ({ t }: { t: (key: string) => string }) => ({
        id: `${id}:check-config`,
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config: TConfig) => {
          const errors: Array<{ error: unknown }> = []
          if (!config.apiKey?.trim())
            errors.push({ error: new Error('API key is required.') })
          if (!config.baseUrl?.trim())
            errors.push({ error: new Error('Base URL is required.') })

          return {
            errors,
            reason: errors.map(item => (item.error as Error).message).join(', '),
            reasonKey: '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  }
}

function normalizeBaseUrl(baseUrl: string | undefined) {
  return `${(baseUrl || 'https://api.xiaomimimo.com/v1/').replace(/\/+$/, '')}/`
}

function readBlobAsDataUri(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Failed to read audio file'))
    reader.readAsDataURL(file)
  })
}

export const providerMimoAudioSpeech = defineProvider<MimoSpeechConfig>({
  createProvider: createMimoSpeechProvider,
  createProviderConfig: () => mimoSpeechConfigSchema,
  description: 'api.xiaomimimo.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.mimo.description'),
  extraMethods: {
    listModels: async () => [
      { deprecated: false, description: 'Preset voice synthesis with the built-in MiMo voice list', id: 'mimo-v2.5-tts', name: 'MiMo v2.5 TTS', provider: 'mimo-audio-speech' },
      { deprecated: false, description: 'Design a new voice from a natural language description', id: 'mimo-v2.5-tts-voicedesign', name: 'MiMo v2.5 TTS Voice Design', provider: 'mimo-audio-speech' },
      { deprecated: false, description: 'Clone a voice from a base64-encoded audio sample', id: 'mimo-v2.5-tts-voiceclone', name: 'MiMo v2.5 TTS Voice Clone', provider: 'mimo-audio-speech' },
    ],
    listVoices: async () => [
      { gender: 'female', id: 'mimo_default', languages: [{ code: 'en', title: 'English' }, { code: 'zh', title: 'Chinese' }], name: 'MiMo-默认', provider: 'mimo-audio-speech' },
      { gender: 'female', id: '冰糖', languages: [{ code: 'zh', title: 'Chinese' }], name: '冰糖', provider: 'mimo-audio-speech' },
      { gender: 'female', id: '茉莉', languages: [{ code: 'zh', title: 'Chinese' }], name: '茉莉', provider: 'mimo-audio-speech' },
      { gender: 'male', id: '苏打', languages: [{ code: 'zh', title: 'Chinese' }], name: '苏打', provider: 'mimo-audio-speech' },
      { gender: 'male', id: '白桦', languages: [{ code: 'zh', title: 'Chinese' }], name: '白桦', provider: 'mimo-audio-speech' },
      { gender: 'female', id: 'Mia', languages: [{ code: 'en', title: 'English' }], name: 'Mia', provider: 'mimo-audio-speech' },
      { gender: 'female', id: 'Chloe', languages: [{ code: 'en', title: 'English' }], name: 'Chloe', provider: 'mimo-audio-speech' },
      { gender: 'male', id: 'Milo', languages: [{ code: 'en', title: 'English' }], name: 'Milo', provider: 'mimo-audio-speech' },
      { gender: 'male', id: 'Dean', languages: [{ code: 'en', title: 'English' }], name: 'Dean', provider: 'mimo-audio-speech' },
    ],
  },
  icon: 'i-simple-icons:xiaomi',
  id: 'mimo-audio-speech',
  name: 'Xiaomi MiMo',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.mimo.title'),
  tasks: ['text-to-speech'],
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createMimoValidators<MimoSpeechConfig>('mimo-audio-speech'),
})

export const providerMimoAudioTranscription = defineProvider<MimoTranscriptionConfig>({
  capabilities: {
    transcription: { generateOutput: true, protocol: 'http', streamInput: false, streamOutput: false },
  },
  createProvider: createMimoTranscriptionProvider,
  createProviderConfig: () => mimoTranscriptionConfigSchema,
  description: 'api.xiaomimimo.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.mimo.description'),
  extraMethods: {
    listModels: async () => [
      { contextLength: 256000, deprecated: false, description: 'Omni-modal model with native audio understanding and speech-to-text', id: 'mimo-v2-omni', name: 'MiMo V2 Omni', provider: 'mimo-audio-transcription' },
      { contextLength: 1_000_000, deprecated: false, description: 'Latest omni-modal model with audio understanding, 1M context', id: 'mimo-v2.5', name: 'MiMo V2.5', provider: 'mimo-audio-transcription' },
    ],
  },
  icon: 'i-simple-icons:xiaomi',
  id: 'mimo-audio-transcription',
  name: 'Xiaomi MiMo',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.mimo.title'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createMimoValidators<MimoTranscriptionConfig>('mimo-audio-transcription'),
})
