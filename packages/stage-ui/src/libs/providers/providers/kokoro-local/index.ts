import type { ProgressInfo } from '@xsai-transformers/shared/types'

import type { VoiceKey } from '../../../../workers/kokoro/types'

import { getCachedWebGPUCapabilities } from '@proj-airi/stage-shared/webgpu'
import { z } from 'zod'

import { getDefaultKokoroModel, KOKORO_MODELS, kokoroModelsToModelInfo } from '../../../../workers/kokoro/constants'
import { getKokoroAdapter } from '../../../inference/adapters/kokoro'
import { defineProvider } from '../registry'

interface KokoroVoice {
  language: string
  name: string
  gender: string
}

const languageByCode: Record<string, { code: string, title: string }> = {
  'en-us': { code: 'en-US', title: 'English (US)' },
  'en-gb': { code: 'en-GB', title: 'English (UK)' },
  'ja': { code: 'ja', title: 'Japanese' },
  'zh-cn': { code: 'zh-CN', title: 'Chinese (Mandarin)' },
  'es': { code: 'es', title: 'Spanish' },
  'fr': { code: 'fr', title: 'French' },
  'hi': { code: 'hi', title: 'Hindi' },
  'it': { code: 'it', title: 'Italian' },
  'pt-br': { code: 'pt-BR', title: 'Portuguese (Brazil)' },
}

function getWebGpuState() {
  const capabilities = getCachedWebGPUCapabilities()
  return {
    supported: capabilities?.supported ?? (typeof navigator !== 'undefined' && Boolean(navigator.gpu)),
    fp16Supported: capabilities?.fp16Supported ?? false,
  }
}

function getModel(modelId: string) {
  return KOKORO_MODELS.find(model => model.id === modelId)
}

function assertModelSupported(modelId: string) {
  const model = getModel(modelId)
  if (!model)
    throw new Error(`Invalid model: ${modelId}. Must be one of: ${KOKORO_MODELS.map(item => item.id).join(', ')}`)

  if (model.platform === 'webgpu' && !getWebGpuState().supported)
    throw new Error('WebGPU is required for this model but is not available in your browser')

  return model
}

function progressInfo(progress: { file?: string, percent: number, loaded?: number, total?: number }): ProgressInfo {
  return {
    name: progress.file ?? '',
    file: progress.file ?? '',
    progress: progress.percent >= 0 ? progress.percent : 0,
    status: 'progress',
    loaded: progress.loaded ?? 0,
    total: progress.total ?? 0,
  }
}

let lastLoadedModelId: string | null = null

export const providerKokoroLocal = defineProvider({
  id: 'kokoro-local',
  name: 'Kokoro TTS',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.kokoro-local.title'),
  description: 'Local text-to-speech using Kokoro-82M.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.kokoro-local.description'),
  tasks: ['text-to-speech'],
  icon: 'i-lobe-icons:speaker',
  requiresCredentials: false,
  createProviderConfig: () => {
    const capabilities = getWebGpuState()
    return z.object({
      model: z.string().default(getDefaultKokoroModel(capabilities.supported, capabilities.fp16Supported)),
      voiceId: z.string().default(''),
    })
  },
  createProvider() {
    const adapterPromise = getKokoroAdapter()
    return {
      speech: () => ({
        baseURL: 'http://kokoro-local/v1/',
        model: 'kokoro-82m',
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          if (!init?.body || typeof init.body !== 'string')
            throw new Error('Invalid request body')

          const body = JSON.parse(init.body) as { input?: string, voice?: string }
          if (!body.voice)
            throw new Error('Voice parameter is required')

          try {
            const adapter = await adapterPromise
            if (!(body.voice in adapter.getVoices()))
              throw new Error(`Unknown Kokoro voice: ${body.voice}`)
            const buffer = await adapter.generate(body.input ?? '', body.voice as VoiceKey)
            return new Response(buffer, {
              status: 200,
              headers: { 'Content-Type': 'audio/wav' },
            })
          }
          catch (error) {
            console.error('Kokoro TTS generation failed:', error)
            throw error
          }
        },
      }),
    }
  },
  validationRequiredWhen: () => false,
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'kokoro-local:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          if (!config.model) {
            return {
              errors: [{ error: new Error('No model selected') }],
              reason: 'Please select a model from the dropdown menu',
              reasonKey: '',
              valid: false,
            }
          }
          if (!getModel(config.model)) {
            const reason = `Invalid model. Must be one of: ${KOKORO_MODELS.map(model => model.id).join(', ')}`
            return { errors: [{ error: new Error(`Invalid model: ${config.model}`) }], reason, reasonKey: '', valid: false }
          }
          return { errors: [], reason: '', reasonKey: '', valid: true }
        },
      }),
    ],
  },
  extraMethods: {
    listModels: async () => {
      const capabilities = getWebGpuState()
      return kokoroModelsToModelInfo(capabilities.supported, undefined, capabilities.fp16Supported)
    },
    loadModel: async (config, _provider, hooks) => {
      const model = assertModelSupported(config.model)
      try {
        const adapter = await getKokoroAdapter()
        await adapter.loadModel(model.quantization, model.platform, {
          onProgress: hooks?.onProgress ? progress => hooks.onProgress?.(progressInfo(progress)) : undefined,
        })
      }
      catch (error) {
        console.error('Failed to load Kokoro model:', error)
        throw error
      }
    },
    listVoices: async (config) => {
      try {
        const adapter = await getKokoroAdapter()
        if (adapter.state !== 'ready' || config.model !== lastLoadedModelId) {
          const model = assertModelSupported(config.model)
          await adapter.loadModel(model.quantization, model.platform)
          lastLoadedModelId = config.model
        }

        return Object.entries(adapter.getVoices() as Record<string, KokoroVoice>).map(([id, voice]) => {
          const languageCode = voice.language.toLowerCase()
          const language = languageByCode[languageCode] || { code: languageCode, title: voice.language }
          return {
            id,
            name: `${voice.name} (${voice.gender}, ${language.title.split('(')[0].trim()})`,
            provider: 'kokoro-local',
            languages: [language],
            gender: voice.gender.toLowerCase(),
          }
        })
      }
      catch (error) {
        console.error('Failed to fetch Kokoro voices:', error)
        // Voice discovery can run before model loading. An empty list is safe.
        return []
      }
    },
  },
})
