import { z } from 'zod'

import { defineProvider } from '../registry'

const mimoSpeechConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default('https://api.xiaomimimo.com/v1/'),
  model: z.string().default('mimo-v2.5-tts'),
  voice: z.string().default('mimo_default'),
  format: z.string().default('wav'),
  stylePrompt: z.string().optional(),
  voiceSample: z.string().optional(),
})

const mimoTranscriptionConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default('https://api.xiaomimimo.com/v1/'),
  model: z.string().default('mimo-v2-omni'),
})

type MimoSpeechConfig = z.input<typeof mimoSpeechConfigSchema>
type MimoTranscriptionConfig = z.input<typeof mimoTranscriptionConfigSchema>
type MimoConfig = MimoSpeechConfig | MimoTranscriptionConfig

function normalizeBaseUrl(baseUrl: string | undefined) {
  return `${(baseUrl || 'https://api.xiaomimimo.com/v1/').replace(/\/+$/, '')}/`
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

function createMimoSpeechProvider(config: MimoSpeechConfig) {
  const apiKey = config.apiKey?.trim() ?? ''
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const defaultModel = config.model || 'mimo-v2.5-tts'
  const defaultVoice = config.voice || 'mimo_default'
  const defaultFormat = config.format || 'wav'

  return {
    speech: () => ({
      baseURL: baseUrl,
      model: defaultModel,
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.body || typeof init.body !== 'string')
          throw new Error('Invalid request body')

        const body = JSON.parse(init.body) as {
          input?: string
          model?: string
          response_format?: string
          style_prompt?: string
          voice_sample?: string
          voice?: string
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'user', content: userPrompt },
              { role: 'assistant', content: body.input ?? '' },
            ],
            audio,
          }),
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
          status: 200,
          headers: { 'Content-Type': contentType },
        })
      },
    }),
  }
}

function audioFormatFromDataUri(dataUri: string) {
  const mimeType = dataUri.split(';')[0]?.split(':')[1] || 'audio/wav'
  const format = mimeType.split('/')[1] || 'wav'
  if (format === 'webm' || format === 'mp4')
    return format
  if (format === 'mpeg' || format === 'mp3')
    return 'mp3'
  return 'wav'
}

function readBlobAsDataUri(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Failed to read audio file'))
    reader.readAsDataURL(file)
  })
}

function createMimoTranscriptionProvider(config: MimoTranscriptionConfig) {
  const apiKey = config.apiKey?.trim() ?? ''
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const defaultModel = config.model || 'mimo-v2-omni'

  return {
    transcription: (model: string) => ({
      baseURL: baseUrl,
      model: model || defaultModel,
      headers: {},
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
          body: JSON.stringify({
            model: modelName,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: 'Transcribe the audio content.' },
                { type: 'input_audio', input_audio: { data: base64Data, format: audioFormatFromDataUri(dataUri) } },
              ],
            }],
          }),
        })
        if (!response.ok) {
          const errorBody = await response.text().catch(() => '')
          throw new Error(`MiMo transcription failed: ${response.status} ${response.statusText}${errorBody ? ` — ${errorBody}` : ''}`)
        }

        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
        return new Response(JSON.stringify({ text: data.choices?.[0]?.message?.content || '' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    }),
  }
}

export const providerMimoAudioSpeech = defineProvider<MimoSpeechConfig>({
  id: 'mimo-audio-speech',
  name: 'Xiaomi MiMo',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.mimo.title'),
  description: 'api.xiaomimimo.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.mimo.description'),
  tasks: ['text-to-speech'],
  icon: 'i-simple-icons:xiaomi',
  createProviderConfig: () => mimoSpeechConfigSchema,
  createProvider: createMimoSpeechProvider,
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createMimoValidators<MimoSpeechConfig>('mimo-audio-speech'),
  extraMethods: {
    listModels: async () => [
      { id: 'mimo-v2.5-tts', name: 'MiMo v2.5 TTS', provider: 'mimo-audio-speech', description: 'Preset voice synthesis with the built-in MiMo voice list', deprecated: false },
      { id: 'mimo-v2.5-tts-voicedesign', name: 'MiMo v2.5 TTS Voice Design', provider: 'mimo-audio-speech', description: 'Design a new voice from a natural language description', deprecated: false },
      { id: 'mimo-v2.5-tts-voiceclone', name: 'MiMo v2.5 TTS Voice Clone', provider: 'mimo-audio-speech', description: 'Clone a voice from a base64-encoded audio sample', deprecated: false },
    ],
    listVoices: async () => [
      { id: 'mimo_default', name: 'MiMo-默认', provider: 'mimo-audio-speech', gender: 'female', languages: [{ code: 'en', title: 'English' }, { code: 'zh', title: 'Chinese' }] },
      { id: '冰糖', name: '冰糖', provider: 'mimo-audio-speech', gender: 'female', languages: [{ code: 'zh', title: 'Chinese' }] },
      { id: '茉莉', name: '茉莉', provider: 'mimo-audio-speech', gender: 'female', languages: [{ code: 'zh', title: 'Chinese' }] },
      { id: '苏打', name: '苏打', provider: 'mimo-audio-speech', gender: 'male', languages: [{ code: 'zh', title: 'Chinese' }] },
      { id: '白桦', name: '白桦', provider: 'mimo-audio-speech', gender: 'male', languages: [{ code: 'zh', title: 'Chinese' }] },
      { id: 'Mia', name: 'Mia', provider: 'mimo-audio-speech', gender: 'female', languages: [{ code: 'en', title: 'English' }] },
      { id: 'Chloe', name: 'Chloe', provider: 'mimo-audio-speech', gender: 'female', languages: [{ code: 'en', title: 'English' }] },
      { id: 'Milo', name: 'Milo', provider: 'mimo-audio-speech', gender: 'male', languages: [{ code: 'en', title: 'English' }] },
      { id: 'Dean', name: 'Dean', provider: 'mimo-audio-speech', gender: 'male', languages: [{ code: 'en', title: 'English' }] },
    ],
  },
})

export const providerMimoAudioTranscription = defineProvider<MimoTranscriptionConfig>({
  id: 'mimo-audio-transcription',
  name: 'Xiaomi MiMo',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.mimo.title'),
  description: 'api.xiaomimimo.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.mimo.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-simple-icons:xiaomi',
  capabilities: {
    transcription: { protocol: 'http', generateOutput: true, streamOutput: false, streamInput: false },
  },
  createProviderConfig: () => mimoTranscriptionConfigSchema,
  createProvider: createMimoTranscriptionProvider,
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createMimoValidators<MimoTranscriptionConfig>('mimo-audio-transcription'),
  extraMethods: {
    listModels: async () => [
      { id: 'mimo-v2-omni', name: 'MiMo V2 Omni', provider: 'mimo-audio-transcription', description: 'Omni-modal model with native audio understanding and speech-to-text', contextLength: 256000, deprecated: false },
      { id: 'mimo-v2.5', name: 'MiMo V2.5', provider: 'mimo-audio-transcription', description: 'Latest omni-modal model with audio understanding, 1M context', contextLength: 1_000_000, deprecated: false },
    ],
  },
})
